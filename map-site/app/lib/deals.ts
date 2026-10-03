export type Cuisine = "日料" | "中餐" | "咖啡" | "西餐";
/** Shared contract: coordinates must come from a geocoder, not an AI guess. */
export type Deal = {
  id: string; restaurantName: string; title: string; description: string;
  latitude: number; longitude: number; address: string; city: string; cuisine: Cuisine;
  price?: number; currency?: "CAD" | "USD"; discountPercent?: number;
  schedule?: string; conditions?: string[]; sourceUrl?: string; expiresAt?: string; isDemo?: boolean;
};
const samples: Array<[string,string,string,Cuisine,number,number,number,number,string]> = [
  ["Mori Ramen","第二碗拉面半价","Vancouver","日料",49.2842,-123.1264,14.5,50,"Robson Street"],
  ["Little Steam 小笼","午餐套餐 $12.90","Vancouver","中餐",49.2794,-123.116,12.9,25,"West Pender Street"],
  ["Daybreak Coffee","咖啡 + 可颂 $7","Vancouver","咖啡",49.2744,-123.1227,7,30,"Davie Street"],
  ["The Green Table","主食享 8 折","Vancouver","西餐",49.2686,-123.1493,18,20,"West 4th Avenue"],
  ["Kumo Sushi","双人寿司组合 $29","Vancouver","日料",49.2639,-123.1158,29,35,"West Broadway"],
  ["Noodle Corner","招牌拌面 $9.90","Vancouver","中餐",49.2808,-123.1005,9.9,20,"Chinatown"],
  ["Amber Café","第二杯咖啡免费","Vancouver","咖啡",49.288,-123.1156,5.5,50,"Coal Harbour"],
  ["Sunday Burger","汉堡套餐 $13","Vancouver","西餐",49.2707,-123.1016,13,25,"Main Street"],
  ["竹里小馆","晚餐菜品 8 折","Richmond","中餐",49.17,-123.1363,16,20,"Richmond Centre"],
  ["Nori Kitchen","便当 $11.50","Richmond","日料",49.1792,-123.1313,11.5,30,"Lansdowne Road"],
  ["Moss Coffee","下午茶套餐 $8","Burnaby","咖啡",49.2277,-123.0017,8,25,"Metrotown"],
  ["Parkside Pizza","第二份披萨半价","Burnaby","西餐",49.2656,-123.0013,19,50,"Brentwood"],
];
const descriptions:Record<Cuisine,string>={"日料":"热乎乎的料理，留一点时间和朋友一起享用。","中餐":"熟悉的味道，一顿简单又满足的好饭。","咖啡":"一杯咖啡配一点甜，把忙碌的日子放慢一点。","西餐":"从现做主食到小食，找到今天想吃的那一口。"};
export const demoDeals: Deal[] = samples.map(([restaurantName,title,city,cuisine,latitude,longitude,price,discountPercent,address],i)=>({id:`demo-${i+1}`,restaurantName,title,city,cuisine,latitude,longitude,price,discountPercent,address:`${address} · 示例位置`,currency:"CAD",description:descriptions[cuisine],schedule:i%2?"周一至周五 · 11:30–14:00":"每天 · 14:00–17:00",conditions:["仅限指定餐品","示例优惠，不代表商家真实活动"],isDemo:true}));
export function validateDeals(input: unknown): Deal[] {
  if (!Array.isArray(input)) throw new Error("优惠数据必须是数组。");
  const ids=new Set<string>();
  return input.map((row,index)=>{
    if (!row || typeof row!=="object") throw new Error(`第 ${index+1} 条优惠格式不正确。`);
    const d=row as Record<string,unknown>;
    for(const key of ["id","restaurantName","title","description","address","city","cuisine"]) if(typeof d[key]!=="string" || !(d[key] as string).trim()) throw new Error(`第 ${index+1} 条优惠缺少 ${key}。`);
    if(ids.has(d.id as string)) throw new Error("优惠 id 不能重复。"); ids.add(d.id as string);
    if(typeof d.latitude!=="number" || !Number.isFinite(d.latitude) || Math.abs(d.latitude)>85 || typeof d.longitude!=="number" || !Number.isFinite(d.longitude) || Math.abs(d.longitude)>180) throw new Error(`第 ${index+1} 条优惠的经纬度无效。`);
    if(!["日料","中餐","咖啡","西餐"].includes(d.cuisine as string)) throw new Error("不支持的餐厅分类。");
    for(const key of ["price","discountPercent"]) if(d[key]!==undefined && (typeof d[key]!=="number" || !Number.isFinite(d[key]) || (d[key] as number)<0)) throw new Error(`${key} 必须是非负数字。`);
    if(typeof d.discountPercent==="number" && d.discountPercent>100) throw new Error("折扣百分比不能超过 100。");
    for(const key of ["schedule","sourceUrl","expiresAt"]) if(d[key]!==undefined && typeof d[key]!=="string") throw new Error(`${key} 必须是文本。`);
    if(d.conditions!==undefined && (!Array.isArray(d.conditions) || !d.conditions.every(x=>typeof x==="string"))) throw new Error("conditions 必须是文本数组。");
    if(d.currency!==undefined && d.currency!=="CAD" && d.currency!=="USD") throw new Error("currency 必须是 CAD 或 USD。");
    if(d.isDemo!==undefined && typeof d.isDemo!=="boolean") throw new Error("isDemo 必须是布尔值。");
    if(d.expiresAt && !Number.isFinite(Date.parse(d.expiresAt as string))) throw new Error("expiresAt 必须是有效日期。");
    if(d.sourceUrl){const u=new URL(d.sourceUrl as string);if(!["http:","https:"].includes(u.protocol)) throw new Error("来源链接须为 HTTP 或 HTTPS。");}
    return d as unknown as Deal;
  });
}
