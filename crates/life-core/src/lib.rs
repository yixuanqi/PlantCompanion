//! Deterministic lifecycle engine. No wall clock, OS APIs, UI, or async timers.
//! The caller supplies *observed* elapsed monotonic time and input evidence.
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const MINUTE_MS: u64 = 60_000;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Species { Mint, Mushroom }

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage { Healthy, Thirsty, Dry, Critical, Dead }

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SleepReason { Idle, Lock, Suspend, Manual, QuietHours, Recovery }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub reminder_minutes: u64,
    pub idle_sleep_minutes: u64,
    pub idle_sleep_enabled: bool,
    pub click_min_interval_minutes: u64,
    pub reward_interval_minutes: u64,
    /// Activity window uses local civil time only to protect the plant, never to age it.
    pub quiet_hours_enabled: bool,
    pub active_start_minute: u16,
    pub active_end_minute: u16,
}
impl Default for Settings {
    fn default() -> Self {
        Self { reminder_minutes: 45, idle_sleep_minutes: 10, idle_sleep_enabled: true,
               click_min_interval_minutes: 15, reward_interval_minutes: 30,
               quiet_hours_enabled: true, active_start_minute: 8 * 60, active_end_minute: 22 * 60 }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !(5..=180).contains(&self.reminder_minutes) { return Err("reminder_minutes must be 5..180"); }
        if !(1..=120).contains(&self.idle_sleep_minutes) { return Err("idle_sleep_minutes must be 1..120"); }
        if self.click_min_interval_minutes > 180 { return Err("click cooldown must be <=180"); }
        if self.reward_interval_minutes > 360 { return Err("reward cooldown must be <=360"); }
        if self.active_start_minute >= 1440 || self.active_end_minute >= 1440 || self.active_start_minute == self.active_end_minute {
            return Err("invalid active hours");
        }
        Ok(())
    }
    pub fn is_quiet_at(&self, local_minute: u16) -> bool {
        if !self.quiet_hours_enabled { return false; }
        let start = self.active_start_minute;
        let end = self.active_end_minute;
        let active = if start < end {
            local_minute >= start && local_minute < end
        } else {
            local_minute >= start || local_minute < end
        };
        !active
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plant {
    pub instance_id: String,
    pub generation: u64,
    pub species: Species,
    pub stage: Stage,
    pub active_elapsed_ms: u64,
    pub total_active_ms: u64,
    pub cycle_reminder_ms: u64,
    pub cycle_number: u64,
    pub drink_count: u64,
    pub growth_points: u64,
    /// Informational wall clock only; never used to determine death.
    pub planted_at_unix_ms: i64,
    pub died_at_unix_ms: Option<i64>,
    pub reminder_fired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub settings: Settings,
    pub current: Option<Plant>,
    pub memorials: Vec<Plant>,
    pub unlocked: BTreeSet<Species>,
    pub droplets: i64,
    pub total_confirmed_active_ms: u64,
    pub last_water_total_active_ms: Option<u64>,
    pub last_reward_total_active_ms: Option<u64>,
    pub last_reward_cycle: Option<String>,
    pub processed_request_ids: BTreeSet<String>,
    pub next_instance_id: u64,
    pub sleep_reasons: BTreeSet<SleepReason>,
    /// Unconfirmed time in a continuous no-input interval; never commits death.
    pub pending_idle_ms: u64,
    #[serde(default)]
    pub manual_sleep_until_unix_ms: Option<i64>,
}
impl Default for Game {
    fn default() -> Self {
        Self {
            settings: Settings::default(), current: None, memorials: vec![], unlocked: BTreeSet::new(),
            droplets: 0, total_confirmed_active_ms: 0, last_water_total_active_ms: None,
            last_reward_total_active_ms: None, last_reward_cycle: None,
            processed_request_ids: BTreeSet::new(), next_instance_id: 1,
            sleep_reasons: BTreeSet::new(), pending_idle_ms: 0, manual_sleep_until_unix_ms: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Effect { StageChanged(Stage), Reminder, Died(String), FellAsleep, WokeUp }

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DrinkResult { Accepted{ rewarded: bool }, TooSoon, Sleeping, Dead, NoPlant, Duplicate, InvalidRequest }

impl Game {
    pub fn stage_from_elapsed(e: u64, t: u64) -> Stage {
        if e >= t.saturating_add(20 * MINUTE_MS) { Stage::Dead }
        else if e >= t.saturating_add(10 * MINUTE_MS) { Stage::Critical }
        else if e >= t.saturating_mul(90) / 100 { Stage::Dry }
        else if e >= t.saturating_mul(70) / 100 { Stage::Thirsty }
        else { Stage::Healthy }
    }
    pub fn is_sleeping(&self) -> bool { !self.sleep_reasons.is_empty() }
    pub fn is_dead(&self) -> bool { self.current.as_ref().is_some_and(|p| p.stage == Stage::Dead) }
    pub fn can_plant(&self) -> bool { self.current.as_ref().is_none_or(|p| p.stage == Stage::Dead) }

    /// Explicit user action only. No scheduler may call plant_seed on death.
    /// Request-scoped seed placement. Retrying the same request never creates a new generation.
    pub fn plant_seed_once(&mut self, species: Species, unix_ms: i64, request_id: &str) -> Result<bool, &'static str> {
        Self::validate_request_id(request_id)?;
        if self.processed_request_ids.contains(request_id) { return Ok(false); }
        self.plant_seed(species, unix_ms)?;
        self.processed_request_ids.insert(request_id.to_owned());
        Ok(true)
    }

    pub fn unlock_species_once(&mut self, species: Species, request_id: &str) -> Result<bool, &'static str> {
        Self::validate_request_id(request_id)?;
        if self.processed_request_ids.contains(request_id) { return Ok(false); }
        self.unlock_species(species)?;
        self.processed_request_ids.insert(request_id.to_owned());
        Ok(true)
    }

    fn validate_request_id(id: &str) -> Result<(), &'static str> {
        if id.is_empty() || id.len() > 128 { return Err("invalid request_id"); }
        Ok(())
    }

    pub fn plant_seed(&mut self, species: Species, unix_ms: i64) -> Result<String, &'static str> {
        if !self.can_plant() { return Err("current plant is still alive"); }
        if self.unlocked.is_empty() { self.unlocked.insert(species); } // First free pick.
        if !self.unlocked.contains(&species) { return Err("species locked"); }
        if let Some(old) = self.current.take() {
            if old.stage != Stage::Dead { return Err("cannot archive a living plant"); }
            self.memorials.push(old);
        }
        let id = format!("plant-{:012}", self.next_instance_id);
        let generation = self.memorials.iter().filter(|p| p.species == species).count() as u64 + 1;
        self.next_instance_id += 1;
        self.current = Some(Plant {
            instance_id: id.clone(), generation, species, stage: Stage::Healthy,
            active_elapsed_ms: 0, total_active_ms: 0,
            cycle_reminder_ms: self.settings.reminder_minutes * MINUTE_MS,
            cycle_number: 1, drink_count: 0, growth_points: 0,
            planted_at_unix_ms: unix_ms, died_at_unix_ms: None, reminder_fired: false,
        });
        self.pending_idle_ms = 0;
        self.sleep_reasons.clear();
        self.manual_sleep_until_unix_ms = None;
        // Per-plant click cooldown cannot leak into the next generation.
        self.last_water_total_active_ms = None;
        Ok(id)
    }

    /// Buy species access once; an unlocked species can be planted repeatedly.
    pub fn unlock_species(&mut self, species: Species) -> Result<(), &'static str> {
        if self.unlocked.contains(&species) { return Err("already unlocked"); }
        if self.unlocked.is_empty() { return Err("choose the free first plant"); }
        if self.droplets < 6 { return Err("need 6 droplets"); }
        self.droplets -= 6;
        self.unlocked.insert(species);
        Ok(())
    }

    pub fn enter_sleep(&mut self, reason: SleepReason) -> Vec<Effect> {
        if self.is_dead() || self.current.is_none() { return vec![]; }
        // Conservatively discard the unconfirmed interval rather than risking a death.
        self.pending_idle_ms = 0;
        let was_sleeping = self.is_sleeping();
        self.sleep_reasons.insert(reason);
        if !was_sleeping { vec![Effect::FellAsleep] } else { vec![] }
    }
    /// A short rest is measured in real time; it never advances the life clock.
    pub fn snooze(&mut self, minutes: u64, unix_ms: i64) -> Vec<Effect> {
        if minutes == 0 || minutes > 24 * 60 { return vec![]; }
        if self.current.is_none() || self.is_dead() { return vec![]; }
        self.manual_sleep_until_unix_ms = Some(unix_ms.saturating_add((minutes * MINUTE_MS) as i64));
        self.enter_sleep(SleepReason::Manual)
    }

    pub fn expire_snooze(&mut self, unix_ms: i64) -> Vec<Effect> {
        if self.manual_sleep_until_unix_ms.is_some_and(|due| unix_ms >= due) {
            self.manual_sleep_until_unix_ms = None;
            return self.exit_sleep(SleepReason::Manual);
        }
        vec![]
    }

    pub fn exit_sleep(&mut self, reason: SleepReason) -> Vec<Effect> {
        if self.is_dead() || self.current.is_none() { return vec![]; }
        let was_sleeping = self.is_sleeping();
        self.sleep_reasons.remove(&reason);
        if reason == SleepReason::Manual { self.manual_sleep_until_unix_ms = None; }
        if was_sleeping && !self.is_sleeping() { vec![Effect::WokeUp] } else { vec![] }
    }

    /// Only called with *confirmed* activity; UI should never call it directly.
    fn credit_active(&mut self, delta_ms: u64, unix_ms: i64) -> Vec<Effect> {
        if delta_ms == 0 || self.is_sleeping() { return vec![]; }
        let Some(p) = self.current.as_mut() else { return vec![]; };
        if p.stage == Stage::Dead { return vec![]; }
        self.total_confirmed_active_ms = self.total_confirmed_active_ms.saturating_add(delta_ms);
        p.total_active_ms = p.total_active_ms.saturating_add(delta_ms);
        let old_e = p.active_elapsed_ms;
        p.active_elapsed_ms = p.active_elapsed_ms.saturating_add(delta_ms);
        let e = p.active_elapsed_ms;
        let t = p.cycle_reminder_ms;
        let old_stage = p.stage;
        let mut effects = vec![];
        if !p.reminder_fired && old_e < t && e >= t {
            p.reminder_fired = true;
            effects.push(Effect::Reminder);
        }
        p.stage = Self::stage_from_elapsed(e, t);
        if p.stage != old_stage { effects.push(Effect::StageChanged(p.stage)); }
        if p.stage == Stage::Dead {
            p.died_at_unix_ms = Some(unix_ms);
            effects.push(Effect::Died(p.instance_id.clone()));
        }
        effects
    }

    /// Observes a sampled interval. Without input, time is *pending* until proven active.
    /// If the no-input interval reaches idle_sleep_minutes, it is discarded and sleeping begins.
    /// Never call this with wall-clock elapsed from a restart or OS suspend.
    pub fn observe_activity(&mut self, delta_ms: u64, input_since_last_sample: bool, unix_ms: i64) -> Vec<Effect> {
        if self.current.is_none() || self.is_dead() { return vec![]; }
        let limit = self.settings.idle_sleep_minutes * MINUTE_MS;
        if self.sleep_reasons.contains(&SleepReason::Idle) {
            return if input_since_last_sample { self.exit_sleep(SleepReason::Idle) } else { vec![] };
        }
        if self.is_sleeping() { return vec![]; }
        if !self.settings.idle_sleep_enabled {
            return self.credit_active(delta_ms.min(5_000), unix_ms); // cap unexpected long gaps
        }
        // A missed/huge sampling interval is not evidence the user was present.
        if delta_ms >= limit {
            self.pending_idle_ms = 0;
            return if input_since_last_sample { vec![] } else { self.enter_sleep(SleepReason::Idle) };
        }
        if input_since_last_sample {
            let confirmed = self.pending_idle_ms.saturating_add(delta_ms);
            self.pending_idle_ms = 0;
            if confirmed >= limit { return vec![]; } // resumed after unobserved long idle
            return self.credit_active(confirmed, unix_ms);
        }
        self.pending_idle_ms = self.pending_idle_ms.saturating_add(delta_ms);
        if self.pending_idle_ms >= limit { self.enter_sleep(SleepReason::Idle) } else { vec![] }
    }

    pub fn confirm_drink(&mut self, request_id: &str) -> DrinkResult {
        if Self::validate_request_id(request_id).is_err() { return DrinkResult::InvalidRequest; }
        if self.processed_request_ids.contains(request_id) { return DrinkResult::Duplicate; }
        let Some(p) = self.current.as_ref() else { return DrinkResult::NoPlant; };
        if p.stage == Stage::Dead { return DrinkResult::Dead; }
        if self.is_sleeping() { return DrinkResult::Sleeping; }
        let now = self.total_confirmed_active_ms;
        if let Some(previous) = self.last_water_total_active_ms {
            if now.saturating_sub(previous) < self.settings.click_min_interval_minutes * MINUTE_MS {
                return DrinkResult::TooSoon;
            }
        }
        self.processed_request_ids.insert(request_id.to_string());
        let p = self.current.as_mut().expect("validated above");
        let cycle_key = format!("{}:{}", p.instance_id, p.cycle_number);
        let eligible = self.last_reward_total_active_ms.is_none_or(|previous| {
            now.saturating_sub(previous) >= self.settings.reward_interval_minutes * MINUTE_MS
        }) && now >= self.settings.reward_interval_minutes * MINUTE_MS
          && self.last_reward_cycle.as_deref() != Some(&cycle_key);
        if eligible {
            self.last_reward_total_active_ms = Some(now);
            self.last_reward_cycle = Some(cycle_key);
            self.droplets += 1;
        }
        self.last_water_total_active_ms = Some(now);
        p.drink_count += 1;
        p.growth_points += 1;
        p.active_elapsed_ms = 0;
        p.stage = Stage::Healthy;
        p.cycle_number += 1;
        p.cycle_reminder_ms = self.settings.reminder_minutes * MINUTE_MS;
        p.reminder_fired = false;
        DrinkResult::Accepted { rewarded: eligible }
    }

    /// Called on startup after loading an atomic checkpoint: unknown unsaved time is discarded.
    pub fn recover_from_restart(&mut self) {
        self.pending_idle_ms = 0;
        self.sleep_reasons.remove(&SleepReason::Idle);
        self.sleep_reasons.remove(&SleepReason::Lock);
        self.sleep_reasons.remove(&SleepReason::Suspend);
        self.sleep_reasons.remove(&SleepReason::Recovery);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> Game { let mut g = Game::default(); g.plant_seed(Species::Mint, 1000).unwrap(); g }
    fn minutes(n: u64) -> u64 { n*MINUTE_MS }
    fn credit(g: &mut Game, ms: u64) -> Vec<Effect> { g.credit_active(ms, 3000) }
    #[test] fn l01_initial() { let g=ready();assert_eq!(g.current.unwrap().stage, Stage::Healthy); }
    #[test] fn l02_70pct_boundary() { let mut g=ready();let edge=minutes(45)*70/100;credit(&mut g,edge-1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Healthy);credit(&mut g,1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Thirsty); }
    #[test] fn l03_90pct_boundary() { let mut g=ready();let edge=minutes(45)*90/100;credit(&mut g,edge-1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Thirsty);credit(&mut g,1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Dry); }
    #[test] fn l04_reminder_once() {let mut g=ready(); let x=credit(&mut g,minutes(45));assert_eq!(x.iter().filter(|v|**v==Effect::Reminder).count(),1);assert!(!credit(&mut g,1).contains(&Effect::Reminder));}
    #[test] fn l05_critical_boundary(){let mut g=ready();credit(&mut g,minutes(55)-1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Dry);credit(&mut g,1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Critical);}
    #[test] fn l06_death_once(){let mut g=ready();credit(&mut g,minutes(65)-1);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Critical);let e=credit(&mut g,1);assert_eq!(e.iter().filter(|v|matches!(v,Effect::Died(_))).count(),1);assert!(credit(&mut g,minutes(100)).is_empty());assert_eq!(g.current.as_ref().unwrap().stage,Stage::Dead);}
    #[test] fn l07_sleep_in_any_live_stage(){for mins in [0,34,45,60]{let mut g=ready();credit(&mut g,minutes(mins));let e=g.current.as_ref().unwrap().active_elapsed_ms;let stage=g.current.as_ref().unwrap().stage;g.enter_sleep(SleepReason::Manual);assert!(g.observe_activity(minutes(720),false,999).is_empty());g.exit_sleep(SleepReason::Manual);assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,e);assert_eq!(g.current.as_ref().unwrap().stage,stage);}}
    #[test] fn l08_wake_retains_dry(){let mut g=ready();credit(&mut g,minutes(45));g.enter_sleep(SleepReason::Manual);assert_eq!(g.exit_sleep(SleepReason::Manual),vec![Effect::WokeUp]);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Dry);}
    #[test] fn l09_dead_rejects_everything(){let mut g=ready();credit(&mut g,minutes(65));assert!(g.enter_sleep(SleepReason::Manual).is_empty());assert!(g.exit_sleep(SleepReason::Manual).is_empty());assert_eq!(g.confirm_drink("dead"),DrinkResult::Dead);}
    #[test] fn l10_multiple_sleep_reasons(){let mut g=ready();g.enter_sleep(SleepReason::Lock);g.enter_sleep(SleepReason::Manual);assert!(g.exit_sleep(SleepReason::Lock).is_empty());assert!(g.is_sleeping());assert_eq!(g.exit_sleep(SleepReason::Manual),vec![Effect::WokeUp]);}
    #[test] fn l11_no_false_death_during_pending_idle(){let mut g=ready();credit(&mut g,minutes(64));for _ in 0..10 {g.observe_activity(minutes(1),false,0);}assert_eq!(g.current.as_ref().unwrap().stage,Stage::Critical);assert!(g.is_sleeping());}
    #[test] fn l12_user_returns_before_idle_threshold(){let mut g=ready();for _ in 0..9 {g.observe_activity(minutes(1),false,0);}g.observe_activity(0,true,0);assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,minutes(9));}
    #[test] fn l14_restart_does_not_charge_offline(){let mut g=ready();credit(&mut g,minutes(41));g.pending_idle_ms=minutes(3);g.recover_from_restart();assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,minutes(41));assert_eq!(g.pending_idle_ms,0);}
    #[test] fn l15_idempotent_confirmation(){let mut g=ready();credit(&mut g,minutes(35));assert_eq!(g.confirm_drink("abc"),DrinkResult::Accepted{rewarded:true});let coin=g.droplets;assert_eq!(g.confirm_drink("abc"),DrinkResult::Duplicate);assert_eq!(g.droplets,coin);}
    #[test] fn l16_click_cooldown(){let mut g=ready();credit(&mut g,minutes(35));g.confirm_drink("a");credit(&mut g,minutes(14));assert_eq!(g.confirm_drink("b"),DrinkResult::TooSoon);assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,minutes(14));}
    #[test] fn l17_death_stays_dead_until_user_replants(){let mut g=ready();credit(&mut g,minutes(65));let old=g.current.as_ref().unwrap().instance_id.clone();assert!(g.is_dead());assert_eq!(g.current.as_ref().unwrap().instance_id,old);let new=g.plant_seed(Species::Mint,9999).unwrap();assert_ne!(old,new);assert_eq!(g.memorials.len(),1);assert_eq!(g.memorials[0].stage,Stage::Dead);}
    #[test] fn no_auto_plant_when_dead_even_after_long_time(){let mut g=ready();credit(&mut g,minutes(65));g.observe_activity(minutes(999),true,9999);assert_eq!(g.current.as_ref().unwrap().stage,Stage::Dead);assert_eq!(g.next_instance_id,2);}
    #[test] fn cannot_switch_living_plant(){let mut g=ready();assert!(g.plant_seed(Species::Mint,9999).is_err());}
    #[test] fn sleeping_first_click_not_water(){let mut g=ready();g.enter_sleep(SleepReason::Manual);assert_eq!(g.confirm_drink("x"),DrinkResult::Sleeping);assert_eq!(g.current.as_ref().unwrap().drink_count,0);}
    #[test] fn unknown_long_sampling_gap_is_not_active(){let mut g=ready();g.observe_activity(minutes(60),true,9999);assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,0);}
    #[test] fn unlocked_species_persists_across_deaths(){let mut g=ready();g.droplets=6;g.unlock_species(Species::Mushroom).unwrap();credit(&mut g,minutes(65));g.plant_seed(Species::Mushroom,9999).unwrap();assert!(g.unlocked.contains(&Species::Mint));assert!(g.unlocked.contains(&Species::Mushroom));}
}

#[cfg(test)]
mod production_regression_tests {
    use super::*;
    const MIN: u64 = 60_000;

    #[test]
    fn seed_request_is_idempotent_even_after_death() {
        let mut g = Game::default();
        assert!(g.plant_seed_once(Species::Mint, 100, "seed-1").unwrap());
        assert!(!g.plant_seed_once(Species::Mint, 100, "seed-1").unwrap());
        assert_eq!(g.next_instance_id, 2);
        g.observe_activity(5_000, true, 200);
        assert!(g.plant_seed_once(Species::Mint, 100, "seed-2").is_err());
        assert_eq!(g.next_instance_id, 2);
    }

    #[test]
    fn purchase_request_is_idempotent_without_double_charge() {
        let mut g = Game::default();
        g.plant_seed_once(Species::Mint, 100, "seed").unwrap();
        g.droplets = 10;
        assert!(g.unlock_species_once(Species::Mushroom, "buy-1").unwrap());
        assert!(!g.unlock_species_once(Species::Mushroom, "buy-1").unwrap());
        assert_eq!(g.droplets, 4);
        assert_eq!(g.unlocked.len(), 2);
    }

    #[test]
    fn new_generation_has_independent_drink_cooldown() {
        let mut g = Game::default();
        g.plant_seed(Species::Mint, 1).unwrap();
        // Previous generation can be dead shortly after its last confirmation.
        g.total_confirmed_active_ms = 10 * MIN;
        g.last_water_total_active_ms = Some(10 * MIN);
        g.current.as_mut().unwrap().stage = Stage::Dead;
        g.plant_seed(Species::Mint, 2).unwrap();
        assert_eq!(g.confirm_drink("first-new-generation"), DrinkResult::Accepted { rewarded: false });
    }

    #[test]
    fn rejects_invalid_request_ids_before_mutation() {
        let mut g = Game::default();
        assert!(g.plant_seed_once(Species::Mint, 0, "").is_err());
        assert!(g.current.is_none());
        g.plant_seed(Species::Mint, 0).unwrap();
        assert_eq!(g.confirm_drink(""), DrinkResult::InvalidRequest);
        assert_eq!(g.current.as_ref().unwrap().drink_count, 0);
    }

    #[test]
    fn manual_sleep_and_lock_remain_independent_on_restart() {
        let mut g=Game::default();
        g.plant_seed(Species::Mint, 0).unwrap();
        g.enter_sleep(SleepReason::Manual);
        g.enter_sleep(SleepReason::Lock);
        g.recover_from_restart();
        assert!(g.is_sleeping());
        assert!(g.sleep_reasons.contains(&SleepReason::Manual));
        assert!(!g.sleep_reasons.contains(&SleepReason::Lock));
    }

    #[test]
    fn changing_reminder_interval_applies_next_cycle_only() {
        let mut g=Game::default();g.plant_seed(Species::Mint,0).unwrap();
        g.settings.reminder_minutes=90;
        assert_eq!(g.current.as_ref().unwrap().cycle_reminder_ms,45*MIN);
        assert_eq!(g.confirm_drink("water"),DrinkResult::Accepted{rewarded:false});
        assert_eq!(g.current.as_ref().unwrap().cycle_reminder_ms,90*MIN);
    }
}

#[cfg(test)]
mod quiet_hours_and_snooze_tests {
    use super::*;
    #[test]
    fn active_window_and_overnight_windows() {
        let mut s=Settings::default();
        assert!(s.is_quiet_at(0));assert!(!s.is_quiet_at(9*60));
        assert!(s.is_quiet_at(22*60));
        s.active_start_minute=22*60;s.active_end_minute=6*60;
        assert!(!s.is_quiet_at(23*60));assert!(!s.is_quiet_at(5*60));
        assert!(s.is_quiet_at(7*60));
    }
    #[test]
    fn snooze_expires_without_consuming_active_time() {
        let mut g=Game::default();g.plant_seed(Species::Mint,0).unwrap();
        let active=g.current.as_ref().unwrap().active_elapsed_ms;
        g.snooze(60,1000);assert!(g.is_sleeping());
        assert!(g.expire_snooze(1000+59*60_000).is_empty());
        assert_eq!(g.expire_snooze(1000+60*60_000),vec![Effect::WokeUp]);
        assert_eq!(g.current.as_ref().unwrap().active_elapsed_ms,active);
    }
}
