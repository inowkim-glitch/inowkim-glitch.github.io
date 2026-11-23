// 서울/화성 업무용 한국시간 예약 동기화 트리거.
// 실제 Supabase 송수신은 별도 구현해야 하며, 이 파일만으로 데이터가 전송되지는 않습니다.
const TZ='Asia/Seoul';
export function getKoreanClock(date=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)]));
 return parts;
}
export function isScheduledKoreanTime(date=new Date()) {
 const {hour,minute}=getKoreanClock(date);
 // 06~19시 매시간, 이후 22/01/04시
 return minute===0 && ((hour>=6 && hour<=19)||[22,1,4].includes(hour));
}
export function makeSyncController(synchronize) {
 let inFlight=null, lastSlot=null, pending=false;
 async function trigger(reason='manual',date=new Date()) {
  const p=getKoreanClock(date);
  const slot=[p.year,p.month,p.day,p.hour,p.minute].join('-');
  if(reason==='scheduled') {
    if(!isScheduledKoreanTime(date)||slot===lastSlot)return {skipped:true};
    lastSlot=slot;
  }
  if(inFlight){pending=true;return inFlight;}
  inFlight=(async()=> {
    let result;
    do {pending=false;result=await synchronize({reason});}while(pending);
    return result;
  })();
  try {return await inFlight;} finally {inFlight=null;}
 }
 return {trigger};
}
