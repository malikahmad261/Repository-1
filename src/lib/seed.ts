import type { Category, Necessity } from './types';

type SeedSub = [id: string, name: string, necessity: Necessity];
type SeedCat = [id: string, name: string, subs: SeedSub[]];

const N: Necessity = 'necessary';
const D: Necessity = 'discretionary';

/**
 * Starter categories. Ids are readable slugs so they stay stable across the
 * app, the database seed (supabase/schema.sql) and the AI prompt.
 */
export const SEED: SeedCat[] = [
  ['groceries', 'Groceries', [
    ['groceries.staples', 'Staples', N],
    ['groceries.fresh', 'Fresh food', N],
    ['groceries.household', 'Household supplies', N],
    ['groceries.snacks', 'Snacks & sweets', D],
    ['groceries.drinks', 'Drinks', D],
  ]],
  ['eating_out', 'Eating out', [
    ['eating_out.restaurants', 'Restaurants', D],
    ['eating_out.delivery', 'Takeaway & delivery', D],
    ['eating_out.coffee', 'Coffee & snacks', D],
    ['eating_out.work_lunch', 'Work lunches', N],
  ]],
  ['housing', 'Housing', [
    ['housing.rent', 'Rent / mortgage', N],
    ['housing.maintenance', 'Maintenance & repairs', N],
    ['housing.furniture', 'Furniture & decor', D],
  ]],
  ['utilities', 'Utilities', [
    ['utilities.energy', 'Electricity & gas', N],
    ['utilities.water', 'Water', N],
    ['utilities.internet_phone', 'Internet & phone', N],
    ['utilities.subscriptions', 'Streaming & subscriptions', D],
  ]],
  ['transport', 'Transport', [
    ['transport.fuel', 'Fuel', N],
    ['transport.public', 'Public transport', N],
    ['transport.ride_hail', 'Taxi & ride-hailing', D],
    ['transport.car_maintenance', 'Car maintenance', N],
    ['transport.parking', 'Parking & tolls', N],
  ]],
  ['health', 'Health', [
    ['health.medical', 'Doctor & hospital', N],
    ['health.pharmacy', 'Pharmacy', N],
    ['health.fitness', 'Fitness', D],
  ]],
  ['children', 'Children', [
    ['children.school', 'School & childcare', N],
    ['children.clothing', 'Clothing', N],
    ['children.activities', 'Activities', D],
    ['children.toys', 'Toys', D],
  ]],
  ['personal', 'Personal', [
    ['personal.clothing', 'Clothing', D],
    ['personal.care', 'Personal care', N],
    ['personal.hobbies', 'Hobbies', D],
    ['personal.gifts', 'Gifts', D],
  ]],
  ['finance', 'Insurance & finance', [
    ['finance.insurance', 'Insurance', N],
    ['finance.fees', 'Bank fees', N],
    ['finance.loans', 'Loan repayments', N],
  ]],
  ['travel', 'Travel', [
    ['travel.flights', 'Flights', D],
    ['travel.accommodation', 'Accommodation', D],
    ['travel.spending', 'Holiday spending', D],
  ]],
  ['other', 'Other', [
    ['other.uncategorised', 'Uncategorised', D],
  ]],
];

export const UNCATEGORISED_ID = 'other.uncategorised';

export function seedCategories(): Category[] {
  const out: Category[] = [];
  SEED.forEach(([id, name, subs], i) => {
    out.push({ id, name, parentId: null, defaultNecessity: N, sortOrder: i * 100, archived: false });
    subs.forEach(([subId, subName, necessity], j) => {
      out.push({
        id: subId,
        name: subName,
        parentId: id,
        defaultNecessity: necessity,
        sortOrder: i * 100 + j + 1,
        archived: false,
      });
    });
  });
  return out;
}
