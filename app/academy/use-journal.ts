"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {decodeJournal,emptyJournal,JOURNAL_KEY,JOURNAL_EVENT,type LearningJournal} from "@/lib/learning";

export function downloadText(name:string,text:string){
 const blob=new Blob(["\uFEFF",text],{type:"text/markdown;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export function useJournal(){
 const [journal,setJournal]=useState<LearningJournal>(emptyJournal),[ready,setReady]=useState(false),[error,setError]=useState("");const current=useRef(journal);
 const adopt=useCallback((next:LearningJournal)=>{current.current=next;setJournal(next);},[]);
 useEffect(()=>{
  const read=()=>{try{adopt(decodeJournal(localStorage.getItem(JOURNAL_KEY)));setError("");}catch{setError("เบราว์เซอร์ไม่อนุญาตให้เก็บบันทึก ถ้าต้องการเก็บสิ่งที่เขียนไว้ โปรดดาวน์โหลดก่อนออกจากหน้านี้");}setReady(true);};
  const external=(e:StorageEvent)=>{if(e.key===JOURNAL_KEY||e.key===null)read();};read();window.addEventListener(JOURNAL_EVENT,read);window.addEventListener("storage",external);return()=>{window.removeEventListener(JOURNAL_EVENT,read);window.removeEventListener("storage",external);};
 },[adopt]);
 const update=useCallback((change:(j:LearningJournal)=>LearningJournal)=>{
  const next=change(current.current);adopt(next);
  try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(next));setError("");window.dispatchEvent(new Event(JOURNAL_EVENT));return true;}catch{setError("ยังเก็บลงเบราว์เซอร์ไม่ได้ โปรดดาวน์โหลดบันทึกก่อนออกจากหน้านี้");return false;}
 },[adopt]);
 const clear=useCallback(()=>{try{localStorage.removeItem(JOURNAL_KEY);adopt(emptyJournal());setError("");window.dispatchEvent(new Event(JOURNAL_EVENT));return true;}catch{setError("ลบบันทึกไม่ได้ เบราว์เซอร์ไม่อนุญาตให้เข้าถึงพื้นที่จัดเก็บ");return false;}},[adopt]);
 return{journal,ready,error,update,clear};
}
