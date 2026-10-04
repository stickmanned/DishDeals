# AI 搜索与到店推荐

Search published, unexpired stored offers first. If no offer matches, Gemini uses Google Search grounding to discover sourced restaurants. See [Restaurant search fallback](./DISCOVERY.md) for configuration, response fields, verified map pins, and teammate integration.

## 无需 key 的演示

```powershell
cd D:\indie_game_dev\AI\AI_Restaurant_deal\ai-workflow
npm.cmd run demo:search
npm.cmd run demo:search -- "披萨，预算 CAD 10"
```

这是虚构店铺的离线演示，输出保存到 `output/demo-search.json`。没有 key 时，云端接口也可对**已有入库优惠**做基础关键词/别名搜索、规则排序和推荐文案，返回 `mode: "basic"`；复杂语言理解仍需 Gemini。没有入库数据就不会产生真实推荐。

## 搜索接口

`POST https://<deployment>.convex.site/v1/search`，服务端 Header 为 `Authorization: Bearer <WORKFLOW_API_TOKEN>`。

```json
{
  "query": "附近想吃拉面，预算 CAD 15，找个值得去的",
  "language": "zh",
  "origin": { "latitude": 49.17, "longitude": -123.13 },
  "city": "Richmond",
  "maxPrice": 15,
  "currency": "CAD",
  "maxDistanceKm": 3,
  "availableNow": false,
  "limit": 3
}
```

只有 `query` 必填。`language` 默认 `zh`，可用 `en`；`limit` 默认 3、最大 5。明确传入的筛选条件优先于 AI 提取的条件。缺 origin 时，附近/距离搜索会返回补充位置提示；附近未指定半径时使用 5 公里，并在 `intent.maxDistanceKm` 标明。预算与最便宜排序需要明确币种，不把 `$` 自动当成 CAD，不从百分比折扣推算最终餐价。

`availableNow` 检查餐厅所在时区的星期、起止日期和时段，支持跨午夜优惠。缺完整时段的优惠不能通过此筛选；它不等于店铺此刻一定营业、菜品一定有库存。其他硬要求（过敏原安全、营业状态、评分、配送、今天/明天指定时段）不具备可靠数据时会请求澄清。

每个推荐含：

- `dealId`、`deal`、`restaurant`、`sourceUrl`：真实入库数据和来源。
- `distanceKm`：有 origin 时的直线距离，不冒充步行/驾车时间。
- `pitch`：吸引用户考虑到店的简短理由。
- `whyGo`、`facts`、`citedFactIds`：推荐理由及对应证据。
- `caveats`：使用条件、适用星期、有效期与未知信息，UI 应一起显示。
- `cta`：导航按钮文案和 URL。

离线样本会说：

> 既然你在找这个类型，Example Ramen 值得放进你的候选。已记录的优惠价是 CAD 12。距你约 0.5 公里（直线距离）。条件适合你的话，点开路线，再决定要不要去。

这是虚构餐厅的示例。卡片仍展示 `Dine-in only` 和优惠仅适用 Tuesday 等条件。

## 推荐指定店铺

`POST /v1/deals/pitch` 使用同样授权：

```json
{
  "focusDealId": "从搜索或地图结果取得的真实 dealId",
  "query": "我想吃拉面，但在意预算和距离，为什么这家值得考虑？",
  "origin": { "latitude": 49.17, "longitude": -123.13 },
  "maxPrice": 15,
  "currency": "CAD",
  "language": "zh"
}
```

返回相同结果结构，最多一个推荐。指定店也必须满足筛选条件；过期、未发布、超预算或不匹配时不会生成到店推荐。

## 队友与地图组件接入

服务端 `examples/teammate-server.ts` 已增加：

```ts
const result = await client.search({
  query: "附近拉面，预算 CAD 15",
  language: "zh", limit: 3,
  origin: { latitude: 49.17, longitude: -123.13 }
});
// 先检查 result.recommendations 非空，再为选中的结果请求推荐理由。
const selected = await client.pitch({
  query: "为什么推荐这家？", focusDealId: result.recommendations[0].dealId,
  language: "zh", limit: 1
});
```

浏览器直连 Convex 时使用已配置 JWT 的客户端：

```ts
const search = useAction(api.search.find);
const result = await search({ inputJson: JSON.stringify({ query, origin }) });
```

Hook 放组件顶层，调用放按钮/表单事件内。AI 调用显示加载状态；不要把 Bearer token 或 Gemini key 发给浏览器。

项目现有 `map-component` 接收平铺的 `MapDeal`。`src/search-map.ts` 提供 adapter：

```tsx
const mapDeals = toMapDeals(result.recommendations);
// 按各推荐的 dealId 查找并展示 pitch、whyGo、caveats 和 cta。
<DealMap deals={mapDeals} selectedId={selectedId} onSelect={deal => setSelectedId(deal.id)} />
```

该模块提供搜索和推荐接口及地图数据 adapter；宿主应用的搜索框、加载态和推荐卡片由队友接入，地图组件本身未改动。地图组件默认 UI 为英文；宿主可传 `language: "en"` 得到英文推荐。

## 配置与边界

Stored-offer search uses `GEMINI_API_KEY`, optional `GEMINI_SEARCH_MODEL`, and otherwise `GEMINI_MODEL`. A stored match normally uses intent and recommendation calls. An empty stored search instead uses grounded web search and restaurant extraction; optional `GEOAPIFY_API_KEY` verifies discovered branches for map pins. `GEMINI_DISCOVERY_MODEL` can select a separate grounding model. Searches/pitches retain an independent limit of 60 per owner per hour. Location and query are not separately persisted.

AI 只能选择候选优惠 ID 和已生成的事实 ID，并选择“划算、距离、偏好、探索”的推荐角度；最终文案按这些证据生成。不编造“五星、爆火、快售罄”等宣称。不存在的事实、候选、重复选择和违背明确排序的结果会被拒绝并退回基础推荐；错误不会暴露私有 key 或 provider 原始内容。

搜索读取最近 500 条已发布优惠，筛选后最多给模型 20 条候选、给用户 5 条结果。`totalMatches` 是本次读取范围内的匹配数，不是全库计数。大规模上线需扩展索引和分页。Gemini 已用模拟响应验证；实际效果需填 key 后联调。
