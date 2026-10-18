import type {Metadata} from "next";
import AslGame from "../asl/game";
export const metadata:Metadata={title:"ห้องเล่น ASL — SANZARU Hand to Heart"};
export default function PlayPage(){return <AslGame/>;}
