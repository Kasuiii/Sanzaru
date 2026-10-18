import {NODES,TINTS,type Rune} from "@/lib/ritual-shared";
export function RuneMark({rune,size=78}:{rune:Rune;size?:number}){
 const tint=TINTS[rune.tint];
 return <svg className="rune-mark" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={tint.name+" วงแหวน "+rune.rings+" ชั้น รูป "+["สามเหลี่ยม","สายฟ้า","ข้าวหลามตัด"][rune.symbol]} style={{color:tint.color}}>
 <circle cx="50" cy="50" r="43" fill="currentColor" opacity=".06"/><circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="2"/>{rune.rings===2&&<circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="1.5"/>}
 <path d={["M50 27 L73 67 L27 67 Z","M56 24 L33 53 L51 53 L43 78 L70 44 L52 44 Z","M50 24 L73 50 L50 76 L27 50 Z"][rune.symbol]} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}
export function RecipeDiagram({path}:{path:number[]}){
 return <svg className="recipe-diagram" viewBox="0 0 100 100" role="img" aria-label={"วงจรลำดับ "+path.join(" → ")}><defs><marker id={"arrow-"+path.join("")} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="#d9ff73"/></marker></defs>{path.slice(1).map((id,i)=>{const a=NODES[path[i]-1],b=NODES[id-1];return <line key={i} x1={a.x*100} y1={a.y*100} x2={b.x*100} y2={b.y*100} stroke="#d9ff73" strokeWidth="1.7" markerEnd={"url(#arrow-"+path.join("")+")"}/>;})}{NODES.map(n=><g key={n.id}><circle cx={n.x*100} cy={n.y*100} r="5.6" fill={path.includes(n.id)?"#d9ff73":"#31283e"} stroke={path.includes(n.id)?"#d9ff73":"#655676"} strokeWidth=".7"/><text x={n.x*100} y={n.y*100+2.2} textAnchor="middle" fontSize="6.5" fontWeight="700" fill={path.includes(n.id)?"#232b15":"#d4c2e6"}>{n.id}</text></g>)}</svg>;
}
