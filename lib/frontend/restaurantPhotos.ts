/**
 * Photos of the example restaurants, taken from each restaurant's own public website (the page and
 * image URL are recorded below). They are third-party material, resized and bundled here only to make
 * the preview feed realistic. Get permission from each restaurant, or replace them with owned or
 * licensed photos, before any public launch. Restaurants not listed fall back to a stock photo by
 * cuisine, or the neutral placeholder.
 */
export type RestaurantPhoto = { file: string; page: string; source: string };

export const restaurantPhotos: Record<string, RestaurantPhoto> = {
  "The Ramen Butcher": { file: "/images/restaurants/the-ramen-butcher.jpg", page: "https://theramenbutcher.com", source: "https://theramenbutcher.com/img/ramen-ajitamaclassic.png" },
  "Kinton Ramen Gilmore": { file: "/images/restaurants/kinton-ramen-gilmore.jpg", page: "https://kintonramen.com/location/gilmore-place/", source: "https://kintonramen.com/wp-content/themes/wp-kinton/images/top/ramen_from_top.png" },
  "Toyo Sushi": { file: "/images/restaurants/toyo-sushi.jpg", page: "https://www.toyosushi.ca/", source: "https://www.toyosushi.ca/_astro/hero-homepage.6kzSH31z_fgLkg.webp" },
  "Freshslice Pizza": { file: "/images/restaurants/freshslice-pizza.jpg", page: "https://freshslice.com/", source: "https://freshslice.com/wp-content/uploads/2022/09/hero-shot-min.jpg" },
  "Bin 4 Burger Lounge": { file: "/images/restaurants/bin-4-burger-lounge.jpg", page: "https://bin4burgerlounge.com/", source: "https://bin4burgerlounge.com/wp-content/uploads/2025/07/Hero-Video-Still.jpg" },
  "Quesada Burritos & Tacos": { file: "/images/restaurants/quesada-burritos-and-tacos.jpg", page: "https://quesada.ca/quesada-restaurant/burnaby-8605-glenlyon-parkway/", source: "https://quesada.ca/wp-content/uploads/2025/03/Quesada_Burrito-Image_430X280_no-rounded-corners.png" },
  "La Taqueria Pinche Taco Shop": { file: "/images/restaurants/la-taqueria-pinche-taco-shop.jpg", page: "https://www.lataqueria.com/", source: "https://framerusercontent.com/images/Kxv5QHiFptMDdVZvPvj9xiP6Gk.jpeg" },
  "Ambit Cafe": { file: "/images/restaurants/ambit-cafe.jpg", page: "https://www.ambitcafe.ca", source: "https://images.squarespace-cdn.com/content/v1/5e1cdfee39c60c5e6a1b4e9c/c86041a7-67c6-41ff-a9ab-121f9e613223/EJM32023.jpg" },
  "Nando's Chicken": { file: "/images/restaurants/nando-s-chicken.jpg", page: "https://www.nandos.ca/find/metrotown", source: "https://images.ctfassets.net/xlzobf9ybr6d/Lk7q0ZhEgeOf99kM7LcOe/dd06ed144fe30f32df85ae332286cf98/generic-seo-image.jpg" },
  "Top Wok Dim Sum Express": { file: "/images/restaurants/top-wok-dim-sum-express.jpg", page: "https://www.topwokdimsum.com/", source: "https://www.topwokdimsum.com/images/2026/store-topwok-burnaby.jpg" },
  "Saray Turkish Cuisine": { file: "/images/restaurants/saray-turkish-cuisine.jpg", page: "https://sarayturkish.com/", source: "https://sarayturkish.com/api/files/TNT-D3CD94E3/cover/7d6acc9b-6a62-4f01-8af7-d5a41c38eca9.jpg" },
  "Xing Fu Tang": { file: "/images/restaurants/xing-fu-tang.jpg", page: "https://xingfutang.ca/", source: "https://www.xingfutang.ca/wp-content/uploads/2025/12/bubbletea-canada.jpg" },
  "JJ Bean Coffee Roasters": { file: "/images/restaurants/jj-bean-coffee-roasters.jpg", page: "https://jjbeancoffee.com/", source: "https://jjbeancoffee.com/cdn/shop/files/JJ-Cup-Of-Beans_Terry-Dayne.jpg" },
  "Jinya Ramen Bar": { file: "/images/restaurants/jinya-ramen-bar.jpg", page: "https://www.jinyaramenbar.com/locations/amazingbrentwood/", source: "https://jinyaramenbar.b-cdn.net/cms/wp-content/uploads/2020/03/ogp-img.jpg" },
  "Horin Tonkotsu Ramen": { file: "/images/restaurants/horin-tonkotsu-ramen.jpg", page: "https://horinramen.com/", source: "https://horinramen.com/wp-content/uploads/2024/08/The-One.png" },
  "Okoman Japanese Restaurant": { file: "/images/restaurants/okoman-japanese-restaurant.jpg", page: "https://okomansushi.com/", source: "https://okomansushi.com/wp-content/uploads/2024/04/751644956_okoman-restaurant_Food_black_dragon_roll.jpg" },
  "Little Tea House": { file: "/images/restaurants/little-tea-house.jpg", page: "https://littleteahouse.ca/", source: "https://img1.wsimg.com/isteam/ip/01c9cbc0-3882-4bd1-81ac-5fe7e5aa263e/our%20drinks-02-1c49ff6.jpg/:/cr=t:11.11%25,l:0%25,w:100%25,h:88.89%25/rs=w:600,h:300,cg:true" },
  "Sizzle Korean BBQ": { file: "/images/restaurants/sizzle-korean-bbq.jpg", page: "https://szlbbq.ca/", source: "https://szlbbq.ca/about.webp" },
  "Space Chicken": { file: "/images/restaurants/space-chicken.jpg", page: "https://www.spacechicken.ca/", source: "https://www.spacechicken.ca/_next/image" },
  "Pho 99": { file: "/images/restaurants/pho-99.jpg", page: "https://pho99sfu.com/", source: "https://images.squarespace-cdn.com/content/v1/63f6fd09035ef12f9db211a4/5e060296-ae31-4a86-8017-e5e99fe5d35d/IMG_7959.jpg" },
  "Pho 24": { file: "/images/restaurants/pho-24.jpg", page: "https://www.pho24express.ca/", source: "https://www.pho24express.ca/wp-content/uploads/sites/28/2024/06/o-2.jpg" },
  "Kurrywala Indian Cuisine": { file: "/images/restaurants/kurrywala-indian-cuisine.jpg", page: "https://www.kurrywala.net/", source: "https://res.cloudinary.com/gagan/image/upload/h_700,q_auto,f_auto/v1744268710/r1bb9b7ydhtxiusqs3lm.jpg" },
  "Papa Greek": { file: "/images/restaurants/papa-greek.jpg", page: "https://papagreek.com/", source: "https://papagreek.com/static/ca6131444480787940c457023730ba8a/da7cf/homeHero_slideB.jpg" },
  "Dragon Bowl Metro": { file: "/images/restaurants/dragon-bowl-metro.jpg", page: "https://dragonbowl.ca/", source: "https://dragonbowl.ca/wp-content/uploads/2025/04/preview-7.png" },
  "Hart House on Deer Lake": { file: "/images/restaurants/hart-house-on-deer-lake.jpg", page: "http://www.harthouserestaurant.com/", source: "https://irp.cdn-website.com//fd952ca3/dms3rep/multi/opt/Bikes+front-1920w.jpeg" },
  "Mon Paris Patisserie": { file: "/images/restaurants/mon-paris-patisserie.jpg", page: "https://www.monparis.ca/locations/burnaby-bakery/", source: "https://www.monparis.ca/wp-content/uploads/layerslider/Mon-Paris/MonParis-front.jpg" },
  "Obanhmi": { file: "/images/restaurants/obanhmi.jpg", page: "https://obanhmi.ca/", source: "https://images.squarespace-cdn.com/content/v1/5c8e8061a9ab955443862a02/168ce5c9-676b-4f96-a6ae-c6ca3c48a197/Photo+2021-02-07+10+14+54+PM.jpg" },
  "White Spot": { file: "/images/restaurants/white-spot.jpg", page: "https://www.whitespot.ca/", source: "https://craft-assets.whitespot.ca/images/_1200x630_crop_center-center_82_none/EI6A9810_web-1.jpg" },
};
