//! Atomic SQLite persistence of the whole Game with an audit ledger.
//! No UI or Windows APIs; can be tested using an in-memory database.
use plant_life_core::{Game, Plant, Stage};
use rusqlite::{params, Connection, OptionalExtension};
use std::{error::Error, fs, path::Path, time::Duration};

pub type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

pub struct PlantStore { connection: Connection }

impl PlantStore {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
        let conn = Connection::open(path)?;
        Self::initialize(conn)
    }

    pub fn memory() -> Result<Self> { Self::initialize(Connection::open_in_memory()?) }

    fn initialize(connection: Connection) -> Result<Self> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys=ON;
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS snapshot (
                id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL,
                game_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS life_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                plant_id TEXT,
                request_id TEXT UNIQUE,
                unix_ms INTEGER NOT NULL,
                snapshot_revision INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS wallet_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delta INTEGER NOT NULL,
                event_id INTEGER NOT NULL UNIQUE REFERENCES life_events(id)
            );
            CREATE TABLE IF NOT EXISTS memorials (
                plant_id TEXT PRIMARY KEY,
                species TEXT NOT NULL,
                died_at_unix_ms INTEGER NOT NULL,
                plant_json TEXT NOT NULL
            );
            PRAGMA user_version=1;")?;
        Ok(Self { connection })
    }

    /// Initial migration from the v0.2 JSON checkpoint; leave the old file untouched.
    /// Existing SQLite snapshots take precedence over legacy files.
    pub fn load_or_import(&mut self, legacy: Option<&Path>) -> Result<Game> {
        let stored: Option<String> = self.connection.query_row(
            "SELECT game_json FROM snapshot WHERE id=1", [], |r| r.get(0)
        ).optional()?;
        if let Some(data) = stored {
            let mut game: Game = serde_json::from_str(&data)?;
            game.recover_from_restart();
            return Ok(game);
        }
        let mut game = legacy.and_then(|file| {
            [file.to_path_buf(), file.with_extension("json.bak")]
                .into_iter().find_map(|candidate| fs::read(&candidate).ok()
                    .and_then(|bytes| serde_json::from_slice::<Game>(&bytes).ok()))
        }).unwrap_or_default();
        game.recover_from_restart();
        // A migration is atomic, including the wallet opening balance and existing memorials.
        self.persist_inner(None, &game, "migration", None, 0, false)?;
        Ok(game)
    }

    /// Atomic commit: snapshot, life event, wallet balance change and memorial update.
    pub fn commit(&mut self, old: &Game, new: &Game,
        event_type: &str, request_id: Option<&str>, unix_ms: i64) -> Result<()> {
        self.persist_inner(Some(old), new, event_type, request_id, unix_ms, false)
    }

    fn persist_inner(&mut self, old: Option<&Game>, new: &Game,
        event_type: &str, request_id: Option<&str>, unix_ms: i64,
        simulate_failure: bool) -> Result<()> {
        let tx = self.connection.transaction()?;
        let revision: Option<i64> = tx.query_row(
            "SELECT revision FROM snapshot WHERE id=1", [], |r| r.get(0)
        ).optional()?;
        if old.is_some() && revision.is_none() { return Err("snapshot missing".into()); }
        let rev = revision.unwrap_or(-1) + 1;
        let json = serde_json::to_string(new)?;
        tx.execute("INSERT INTO snapshot(id,revision,game_json) VALUES (1,?1,?2)
            ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,game_json=excluded.game_json",
            params![rev, json])?;
        let plant_id = new.current.as_ref().map(|p| p.instance_id.as_str());
        // Periodic snapshots are not user events: avoid unbounded audit-log growth.
        let event_id = if event_type == "checkpoint" {
            None
        } else {
            tx.execute("INSERT INTO life_events(event_type,plant_id,request_id,unix_ms,snapshot_revision)
                VALUES (?1,?2,?3,?4,?5)", params![event_type, plant_id, request_id, unix_ms, rev])?;
            Some(tx.last_insert_rowid())
        };
        let diff = new.droplets.checked_sub(old.map(|g| g.droplets).unwrap_or(0))
            .ok_or("droplets overflow")?;
        if diff != 0 {
            let entry_id = event_id.ok_or("wallet changed during heartbeat")?;
            tx.execute("INSERT INTO wallet_ledger(delta,event_id) VALUES(?1,?2)",
                params![diff, entry_id])?;
        }
        // A DEAD plant appears immediately in memorials. Archiving/replanting is optional.
        let old_dead_id = old.and_then(|g| g.current.as_ref())
            .filter(|p| p.stage == Stage::Dead).map(|p| p.instance_id.as_str());
        let mut candidates: Vec<&Plant> = new.memorials.iter().collect();
        if let Some(p) = new.current.as_ref().filter(|p| p.stage == Stage::Dead) {
            candidates.push(p);
        }
        for p in candidates {
            if p.stage != Stage::Dead { return Err("non-dead memorial".into()); }
            if p.died_at_unix_ms.is_none() && Some(p.instance_id.as_str()) != old_dead_id {
                return Err("dead plant without timestamp".into());
            }
            let plant_json = serde_json::to_string(p)?;
            tx.execute("INSERT OR IGNORE INTO memorials(plant_id,species,died_at_unix_ms,plant_json)
                VALUES (?1,?2,?3,?4)",
                params![p.instance_id, format!("{:?}",p.species).to_lowercase(),
                    p.died_at_unix_ms.unwrap_or(0), plant_json])?;
        }
        if simulate_failure { return Err("simulated power loss before COMMIT".into()); }
        tx.commit()?;
        Ok(())
    }

    pub fn wallet_balance_from_ledger(&self) -> Result<i64> {
        Ok(self.connection.query_row("SELECT COALESCE(SUM(delta),0) FROM wallet_ledger",[],|r|r.get(0))?)
    }

    pub fn memorial_count(&self) -> Result<i64> {
        Ok(self.connection.query_row("SELECT COUNT(*) FROM memorials",[],|r|r.get(0))?)
    }

    #[cfg(test)]
    fn fail_before_commit(&mut self, old: &Game, new: &Game) -> Result<()> {
        self.persist_inner(Some(old),new,"simulate_power_loss",None,0,true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use plant_life_core::Species;
    #[test]
    fn sqlite_migration_and_empty_start() {
        let mut s=PlantStore::memory().unwrap();
        let g=s.load_or_import(None).unwrap();
        assert!(g.current.is_none());
        assert_eq!(s.wallet_balance_from_ledger().unwrap(),0);
    }
    #[test]
    fn atomic_wallet_and_memorial_journal() {
        let mut s=PlantStore::memory().unwrap();let g=s.load_or_import(None).unwrap();
        let mut next=g.clone();next.plant_seed(Species::Mint,100).unwrap();
        s.commit(&g,&next,"plant",Some("seed-1"),100).unwrap();
        let mut purchased=next.clone();purchased.droplets=10;
        s.commit(&next,&purchased,"reward",Some("water-1"),200).unwrap();
        assert_eq!(s.wallet_balance_from_ledger().unwrap(),10);
        let mut dead=purchased.clone();
        let p=dead.current.as_mut().unwrap();p.stage=Stage::Dead;p.died_at_unix_ms=Some(999);
        s.commit(&purchased,&dead,"death",None,999).unwrap();
        assert_eq!(s.memorial_count().unwrap(),1);
        let mut next_gen=dead.clone();next_gen.plant_seed(Species::Mint,1000).unwrap();
        s.commit(&dead,&next_gen,"plant",Some("seed-2"),1000).unwrap();
        assert_eq!(s.memorial_count().unwrap(),1);
    }
    #[test]
    fn failed_transaction_rolls_back_all_tables() {
        let mut s=PlantStore::memory().unwrap();let g=s.load_or_import(None).unwrap();
        let mut next=g.clone();next.droplets=6;
        assert!(s.fail_before_commit(&g,&next).is_err());
        assert_eq!(s.wallet_balance_from_ledger().unwrap(),0);
        assert_eq!(s.load_or_import(None).unwrap().droplets,0);
    }
    #[test]
    fn duplicate_request_cannot_charge_twice() {
        let mut s=PlantStore::memory().unwrap();let g=s.load_or_import(None).unwrap();
        let mut next=g.clone();next.droplets=6;
        s.commit(&g,&next,"reward",Some("duplicate-key"),100).unwrap();
        let mut next2=next.clone();next2.droplets=12;
        assert!(s.commit(&next,&next2,"reward",Some("duplicate-key"),200).is_err());
        assert_eq!(s.wallet_balance_from_ledger().unwrap(),6);
        assert_eq!(s.load_or_import(None).unwrap().droplets,6);
    }
}
