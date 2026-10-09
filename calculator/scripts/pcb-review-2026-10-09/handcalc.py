import math
# CN rates (server/data/pcb-country-rates.ts after REGIONAL_DATA overlay)
base2L, layerAdd, setup = 0.116, 0.07379, 12.65
finish_imag = 1.10; via100 = 0.1897; imp = 0.18
smtRate, batch, thJ, aoiT, xrayT, ictT, lab = 11.6, 18.97, 0.009487, 0.3689, 1.265, 2.635, 6.64
duty, sea, minAir = 0.037, 0.40, 25
srcIdx = 0.88; insp, proc = 0.4227, 0.4159; dppm = 800; pack = 0.063
W, H, L, vias, smt, th, ictSec = 87.8, 48.9, 8, 220, 222, 4, 90
area = W*H/1e4; util = 0.767; waste = 1/util  # 30-up on 480x350 (code prints util 0.767)
# exact utilisation
util = 30*W*H/(480*350); waste = 1/util
def cat(q1k,q10k,q100k,q200k,q300k,parts):
    lerp=lambda qa,pa,qb,pb: pa+(pb-pa)*(math.log10(parts)-math.log10(qa))/(math.log10(qb)-math.log10(qa))
    if parts>=300000: return q300k
    if parts>=200000: return lerp(200000,q200k,300000,q300k)
    if parts>=100000: return lerp(100000,q100k,200000,q200k)
    return lerp(10000,q10k,100000,q100k)
S32R=(22.62,19.227,16.2864,15.5088,15.0713); TEF=(14.1176,12,10.2,9.713,9.439); W25=(0.7933,0.6743,0.5712,0.5439,0.5286)
MAX=(4.2353,3.6,3.06,2.9139,2.8317); TCAN=(0.4212,0.358,0.3033,0.2888,0.2807)
def k(parts): return 1.0 if parts<=100000 else 0.88
def clamp(x,lo,hi): return min(max(x,lo),hi)
for Q in (100000,200000,300000):
    b = {}
    b['U1']=cat(*S32R,Q); b['U2']=cat(*TEF,Q); b['U3']=cat(*W25,Q); b['U6U7']=2*cat(*MAX,2*Q); b['U8']=cat(*TCAN,Q)
    # class-range lines: AI estimate x k, clamped into [lo,hi] x k (and ceilings)
    b['U4U5']=2*clamp(1.4*k(2*Q),0.3*k(2*Q),3*k(2*Q))
    b['U9']=clamp(3.2*k(Q),2*k(Q),min(15,4)*k(Q)); b['U10']=clamp(1.2*k(Q),0.25*k(Q),min(5,3.5)*k(Q))
    b['D/Q']=10*clamp(0.2*k(10*Q),0.03*k(10*Q),0.12*k(10*Q))
    b['Cbulk']=2*clamp(1.8*k(2*Q),0.4*k(2*Q),min(3.5,0.9)*k(2*Q))
    b['Y1']=clamp(2.0*k(Q),1.8*k(Q),8*k(Q))
    b['R']=70*0.006*k(70*Q); b['C0402']=90*0.015*k(90*Q); b['C0603']=30*0.03*k(30*Q); b['L']=10*0.09*k(10*Q)
    b['J1']=clamp(6*k(Q),3*k(Q),18*k(Q)); b['J2J3']=0
    bom=sum(b.values())
    fabBase=area*base2L*waste; fabL=area*layerAdd*(L-2)*waste; surf=(fabBase+fabL)*(finish_imag-1)
    fab=fabBase+fabL+surf+vias/100*via100+(fabBase+fabL)*imp+setup/Q
    asm=smt/3600*smtRate+batch/Q+th*thJ+min(aoiT,20/3600*2*lab+200/Q)+min(xrayT,20/3600*2*lab+300/Q)+min(ictT,ictSec/3600*2*lab+5000/Q)
    burden=0.05 if Q>=100000 else 0.07
    bomS=bom*srcIdx*(1+burden)
    wt=max(0.02,area*L*0.028); freight=max(minAir/Q, wt*sea)
    dutyV=(fab+asm+bomS)*duty
    energy=(area*(0.9+0.15*(L-2))+0.06+0.0008*smt)*0.069  # CN tariff from REGIONAL_DATA ~0.069
    lam=min(0.30,smt*dppm/1e6); yl=lam*(0.95*(0.2*asm+0.5*min(ictT,ictSec/3600*2*lab+5000/Q))+0.05*(fab+asm+bomS))
    # automotive (ASIL-C), on the ROUNDED commercial fab/asm as the code does
    fabR, asmR = round(fab,2), round(asm,2)
    fabPrem=0.18*fabR+0.40*0.50*fabR+min(45,max(8,area*100*0.08))*insp/30+min(35,max(5,L*2.5))*insp/30
    asmPrem=0.20*asmR+0.05*asmR+0.05*proc+180*insp*4/500
    total=fab+asm+freight+dutyV+bomS+energy+pack+yl+fabPrem+asmPrem+(fabPrem+asmPrem)*duty
    print(f"Q={Q:>7}: BOM raw £{bom:.2f}  sourced £{bomS:.2f}  fab £{fab:.4f}(+auto {fabPrem:.3f})  asm £{asm:.4f}(+auto {asmPrem:.3f})  freight {freight:.3f} duty {dutyV+(fabPrem+asmPrem)*duty:.3f} energy {energy:.3f} yield {yl:.3f}  TOTAL £{total:.2f}")
    print('   lines', {k_:round(v,4) for k_,v in b.items()})
