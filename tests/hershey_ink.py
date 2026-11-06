import json, re, random, sys
F=json.load(open('dl/hershey/package/hersheytext.json'))
def glyph_paths(font, ch):
    if ch == ' ': return None, 0
    c = F[font]['chars'][ord(ch)-33]
    paths=[]
    for seg in re.findall(r'M[^M]+', c['d']):
        nums=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', seg)]
        paths.append(list(zip(nums[0::2], nums[1::2])))
    return paths, int(c['o'])
def text_strokes(text, font, x0, y0, scale=1.5, seed=1, jitter=0.6, slant=0.0):
    rnd=random.Random(seed); out=[]; x=x0
    for ch in text:
        if ch==' ': x += 12*scale; continue
        paths, o = glyph_paths(font, ch)
        for p in paths:
            pts=[]
            for (a,b),(c,d) in zip(p, p[1:] or p):
                n=max(1,int(((c-a)**2+(d-b)**2)**0.5/1.5))
                for i in range(n):
                    t=i/n; px=a+(c-a)*t; py=b+(d-b)*t
                    pts.append((px,py))
            pts.append(p[-1])
            flat=[]
            for (px,py) in pts:
                X = x + px*scale + rnd.uniform(-jitter,jitter) - (py*scale)*slant
                Y = y0 + py*scale + rnd.uniform(-jitter,jitter)
                flat += [round(X,2), round(Y,2), 0.5]
            out.append(flat)
        x += 2*o*scale*0.82
    return out
if __name__ == '__main__':
    from PIL import Image, ImageDraw
    img=Image.new('L',(1000,300),255); d=ImageDraw.Draw(img)
    for i,(t,f) in enumerate([('lead with outcomes, not tasks','scripts'),('check vs D05 yield','futural'),('Ask Wei Ling to review it','scriptc')]):
        for s in text_strokes(t,f,20,30+i*90,1.6,seed=i):
            pts=list(zip(s[0::3],s[1::3])); d.line(pts,fill=0,width=3)
    img.save('shots5/hershey.png')
