import { expect, test } from "vitest";
import { addressSearchQuery, defaultLocationSearchQuery } from "../../lib/locationSearchQuery";

test.each([
  ["Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC", "6516 Kingsway, Burnaby, BC"],
  ["Phở Hòa, Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC", "6516 Kingsway, Burnaby, BC"],
  ["123 Sushi, 6516 Kingsway, Burnaby, BC", "6516 Kingsway, Burnaby, BC"],
  ["Cafe, 100 W Georgia St, Vancouver, BC", "100 W Georgia St, Vancouver, BC"],
  ["Cafe, 123 Main Street, Burnaby, BC V5H 1A1", "123 Main Street, Burnaby, BC V5H 1A1"],
  ["Cafe, 200 West Broadway, Vancouver", "200 West Broadway, Vancouver"],
  ["6516 Kingsway, Burnaby, BC", "6516 Kingsway, Burnaby, BC"],
  ["Phở Hòa + jázen tea, Burnaby, BC", "Phở Hòa + jázen tea, Burnaby, BC"],
  ["7 Eleven, Burnaby", "7 Eleven, Burnaby"],
  ["Cafe, Metrotown, Burnaby", "Cafe, Metrotown, Burnaby"],
  ["Cafe, 6516, Burnaby", "Cafe, 6516, Burnaby"],
])("builds a bounded address query from %s", (input, output) => {
  expect(addressSearchQuery(input)).toBe(output);
});

test("uses the name when there is no address and preserves source strings", () => {
  const restaurant = "Phở Hòa + jázen tea";
  const address = "Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC";
  expect(defaultLocationSearchQuery(restaurant, null)).toBe(restaurant);
  expect(defaultLocationSearchQuery(restaurant, " ")).toBe(restaurant);
  expect(defaultLocationSearchQuery(restaurant, address)).toBe("6516 Kingsway, Burnaby, BC");
  expect(address).toContain(restaurant);
});
