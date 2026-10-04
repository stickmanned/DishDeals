import type {SVGProps} from "react";
export function MapIcon({name,...props}:SVGProps<SVGSVGElement>&{name:"fit"|"pin"|"arrow"|"location"}){
  const paths={fit:<><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M8 12h8m-4-4v8"/></>,pin:<><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,arrow:<><path d="m7 17 10-10M7 7h10v10"/></>,location:<><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="1"/></>};
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
