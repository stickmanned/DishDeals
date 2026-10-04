import type {StyleSpecification,LineLayerSpecification,SymbolLayerSpecification} from "maplibre-gl";

/** Original cartography using the OpenMapTiles schema; no Google tiles or branding. */
export function streetStyle():StyleSpecification{
  const source="openmaptiles";
  const classes=(values:string[])=>["match",["get","class"],values,true,false] as const;
  const road=(id:string,values:string[],color:string,width:number):LineLayerSpecification=>({
    id,type:"line",source,"source-layer":"transportation",filter:classes(values) as unknown as LineLayerSpecification["filter"],
    layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":color,
      "line-width":["interpolate",["linear"],["zoom"],8,.4,12,1.2,14,width,16,width*2,18,width*4]},
  });
  const label=(id:string,layer:string,size:number,minzoom:number):SymbolLayerSpecification=>({
    id,type:"symbol",source,"source-layer":layer,minzoom,
    layout:{"text-field":["coalesce",["get","name:en"],["get","name_en"],["get","name:latin"],["get","name"]],
      "text-font":["Noto Sans Regular"],"text-size":size,"text-max-width":10,"text-padding":12},
    paint:{"text-color":"#667076","text-halo-color":"#ffffff","text-halo-width":1.5},
  });
  const roadLabels=label("street-names","transportation_name",11,13);
  roadLabels.layout={...roadLabels.layout,"symbol-placement":"line","text-padding":5,"symbol-spacing":300};
  const districts=label("district-names","place",13,10);
  districts.filter=["match",["get","class"],["suburb","neighbourhood","quarter"],true,false];
  districts.layout={...districts.layout,"text-letter-spacing":.06,"text-transform":"uppercase"};
  const cities=label("city-names","place",18,3);
  cities.filter=["match",["get","class"],["city","town","village"],true,false];
  const waterNames=label("water-names","water_name",12,10);
  waterNames.paint={...waterNames.paint,"text-color":"#517d98","text-halo-color":"#a8d5ec","text-halo-width":1};
  return {version:8,name:"Restaurant streets",glyphs:"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources:{openmaptiles:{type:"vector",url:"https://tiles.openfreemap.org/planet",
      attribution:'<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}},
    layers:[
      {id:"land",type:"background",paint:{"background-color":"#f1f2f0"}},
      {id:"residential",type:"fill",source,"source-layer":"landuse",filter:["==",["get","class"],"residential"],paint:{"fill-color":"#e9ece8"}},
      {id:"woodland",type:"fill",source,"source-layer":"landcover",filter:["match",["get","class"],["wood","grass"],true,false],paint:{"fill-color":"#c5e4b6"}},
      {id:"parks",type:"fill",source,"source-layer":"park",paint:{"fill-color":"#c6e5b6"}},
      {id:"water",type:"fill",source,"source-layer":"water",paint:{"fill-color":"#a8d5ec"}},
      {id:"waterways",type:"line",source,"source-layer":"waterway",paint:{"line-color":"#a8d5ec","line-width":2}},
      {id:"buildings",type:"fill",source,"source-layer":"building",minzoom:15,paint:{"fill-color":"#e0e3df","fill-outline-color":"#d9ddd8"}},
      road("paths",["path","pedestrian","track"],"#ffffff",1),
      road("minor-road-edges",["minor","service"],"#dfe3df",4),
      road("minor-roads",["minor","service"],"#ffffff",3),
      road("secondary-road-edges",["secondary","tertiary"],"#ffffff",6),
      road("secondary-roads",["secondary","tertiary"],"#fff4d2",4),
      road("primary-road-edges",["primary","trunk","motorway"],"#ffffff",8),
      road("primary-roads",["primary","trunk","motorway"],"#f7d36b",5.5),
      roadLabels,waterNames,districts,cities,
    ]};
}
