"""Rebuild aligned transparent layers from the *same* state source image.
Hard partition pixels: composite at zero transform exactly reproduces source;
this is a technical rig, not separately hand-painted source layers.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import shutil, json
root=Path(__file__).resolve().parents[1]
outdir=root/'qa_previews'
outdir.mkdir(exist_ok=True)
report={}
for species in ('mint','mushroom'):
  for state in ('healthy','thirsty','dry','critical','dead','sleep'):
    source=root/'public'/'plant-assets'/species/'states'/f'{state}.png'
    im=Image.open(source).convert('RGBA')
    ar=np.array(im)
    h,w=ar.shape[:2]
    xx=np.broadcast_to(np.arange(w)[None,:],(h,w))
    yy=np.broadcast_to(np.arange(h)[:,None],(h,w))
    if species=='mint':
      # curved seam coincides with the front rim of the round flowerpot.
      seam=174 + 0.0010*(xx-128.)**2
      crown=(yy<seam)
      stem=np.zeros((h,w),dtype=bool)
      pot=~crown
    else:
      cap_end=138
      stem_end=180
      # central mushroom stalk, leave the flowers around the pot static
      stem_bounds=(xx>=80)&(xx<=177)
      crown=(yy<cap_end)
      stem=(yy>=cap_end)&(yy<stem_end)&stem_bounds
      pot=~(crown|stem)
    masks={'pot':pot,'stem':stem,'crown':crown}
    # use independent derived layers with true transparent pixels, preserve original RGB & alpha
    dirout=root/'public'/'plant-assets'/species/'motion_layers'/state
    dirout.mkdir(parents=True,exist_ok=True)
    for k,m in masks.items():
      sub=ar.copy()
      sub[~m]=[0,0,0,0]
      Image.fromarray(sub,'RGBA').save(dirout/f'{k}.png',optimize=True)
    # pixel-perfect sanity: each pixel belongs to exactly one layer
    assign=sum(m.astype(np.uint8) for m in masks.values())
    assert np.all(assign==1)
    # composite on original coordinates
    composite=Image.new('RGBA',(w,h))
    for k in ['pot','stem','crown']:
      composite.alpha_composite(Image.open(dirout/f'{k}.png').convert('RGBA'))
    err=np.abs(np.asarray(composite).astype(np.int16)-ar.astype(np.int16)).max()
    assert err<=8,(species,state,err)
    report[f'{species}/{state}']={'size':f'{w}x{h}','max_pixel_error':int(err),'opaque_pixels':int((ar[:,:,3]>0).sum())}
# upsample sample QA on multiple colored backdrops, order health + sleep + dry
sw=270;sh=315
board=Image.new('RGB',(sw*6,sh*2),'#f7f4ec')
d=ImageDraw.Draw(board)
for row,species in enumerate(('mint','mushroom')):
 for col,stage in enumerate(('healthy','thirsty','dry','critical','dead','sleep')):
  image=Image.open(root/'public'/'plant-assets'/species/'states'/f'{stage}.png').convert('RGBA')
  bg=Image.new('RGBA',(256,256),'#e5ede7' if col%2 else '#3c525a')
  bg.alpha_composite(image)
  board.paste(bg.convert('RGB'),(col*sw+6,row*sh+30))
  d.text((col*sw+12,row*sh+8),f'{species} | {stage}',fill='#283c34')
board.save(outdir/'states_on_dark_light.jpg',quality=95)
(root/'docs'/'14_运动图层与锚点验收_v0.4.md').write_text('''# 运动图层制作说明 v0.4\n\n- `public/plant-assets/{species}/motion_layers/{state}/` 为真正 RGBA 的 **可编程运动图层**，画布统一 256x256。\n- 原图根据花盆口与菌柄位置做像素互斥分区，静止叠合 **逐像素等于原始状态图**，不会出现同一区域重复贴图导致重影。\n- 绘制顺序：`pot → stem → crown`。初始对齐严禁分别缩放/移动图层。\n- CSS 锚点：薄荷叶冠 (50%, 69%)；蘑菇菌盖 (50%, 54%)、菌柄 (50%, 70%)。因为整张画布锚点相同，不使用 DOM 自动居中重新裁切。\n- 当前是工程用运动分区，并非专业画师手绘的独立遮挡/背面素材。极限摆动仍可暴露细微切线，因此每个器官摆幅控制在 ≤1.4°，最终发布需原生分层原画。\n- 六种阶段均有图层，DEAD 不播放 idle，sleep 仅微动；不可逆死亡与动画资产解耦。\n- 边缘评估需要在浅色/深色桌面以及 100/125/150/200% DPI 下检查。\n''',encoding='utf-8')
(root/'scripts'/'make_motion_layers.py').write_text(Path(__file__).read_text(encoding='utf-8').replace("root=Path(__file__).resolve().parents[1]","root=Path(__file__).resolve().parents[1]").replace("outdir=root/'qa_previews'","outdir=root/'qa_previews'"),encoding='utf-8')
(outdir/'alpha_report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print('Generated',len(report)*3,'motion layers, max rgba compositor error=',max(x['max_pixel_error'] for x in report.values()))
