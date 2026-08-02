import type { CatalogEntry } from '@/types/agent';

/**
 * Seed supplement catalog.
 *
 * Stands in for a live vendor feed. Every derived number (cost per active gram,
 * discounted price) is computed by the optimizer from these raw fields rather
 * than stored here, so the catalog cannot drift out of sync with the math.
 *
 * Deliberately includes three proprietary-blend products (`prop_*`) that look
 * competitive on sticker price but are mostly filler. They exist so the
 * optimizer visibly rejects something during a demo — an optimizer that picks
 * everything proves nothing.
 *
 * Label images live under /public/labels. Swap this array for a live feed and
 * nothing downstream changes.
 */
export const SUPPLEMENT_CATALOG: CatalogEntry[] = [
  // --- Creatine Monohydrate -------------------------------------------------
  {
    id: 'creatine_bulk_500',
    brand: 'BulkNutrition',
    productName: 'Creatine Monohydrate Micronized (500g)',
    imageUrl: '/products/creatine_bulk_500',
    labelImageUrl: '/labels/creatine_bulk_500',
    totalPriceUSD: 24.99,
    servingsPerContainer: 100,
    activeIngredients: [
      { name: 'Creatine Monohydrate', amountPerServingGrams: 5.0, purityPercentage: 99.9 },
    ],
    subscribeAndSaveDiscountPct: 15,
    checkoutUrl: 'https://example-merchant.test/p/creatine_bulk_500',
    vendorName: 'iHerb Direct',
    ingredientFamily: 'Creatine',
    servingSizeGrams: 5.3,
    servingUnit: '1 rounded scoop',
    otherIngredients: ['Silicon dioxide'],
  },
  {
    id: 'creatine_peakform_300',
    brand: 'PeakForm',
    productName: 'Creatine Monohydrate (300g)',
    imageUrl: '/products/creatine_peakform_300',
    labelImageUrl: '/labels/creatine_peakform_300',
    totalPriceUSD: 29.99,
    servingsPerContainer: 60,
    activeIngredients: [
      { name: 'Creatine Monohydrate', amountPerServingGrams: 5.0, purityPercentage: 99.5 },
    ],
    subscribeAndSaveDiscountPct: 10,
    checkoutUrl: 'https://example-merchant.test/p/creatine_peakform_300',
    vendorName: 'Amazon',
    ingredientFamily: 'Creatine',
    servingSizeGrams: 5.4,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide', 'Natural flavor'],
  },
  {
    id: 'prop_creasurge_matrix',
    brand: 'ApexLabs',
    productName: 'CreaSurge Matrix™ (30 servings)',
    imageUrl: '/products/prop_creasurge_matrix',
    labelImageUrl: '/labels/prop_creasurge_matrix',
    totalPriceUSD: 44.99,
    servingsPerContainer: 30,
    activeIngredients: [
      { name: 'Creatine Monohydrate', amountPerServingGrams: 1.5, purityPercentage: 65 },
    ],
    subscribeAndSaveDiscountPct: 5,
    checkoutUrl: 'https://example-merchant.test/p/prop_creasurge_matrix',
    vendorName: 'Bodybuilding.com',
    ingredientFamily: 'Creatine',
    servingSizeGrams: 8.0,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide', 'FD&C Red No. 40'],
    proprietaryBlend: {
      name: 'CreaSurge Matrix™ Proprietary Blend',
      totalMg: 6500,
      components: [
        'Maltodextrin',
        'Dextrose',
        'Taurine',
        'Creatine Monohydrate',
        'Citric Acid',
        'Natural & Artificial Flavor',
        'Sucralose',
      ],
    },
    fillerCallouts: [
      'Proprietary blend hides per-ingredient dosing',
      'Creatine listed 4th in a 7-ingredient blend',
      'Maltodextrin is the leading blend component',
    ],
  },

  // --- L-Citrulline ---------------------------------------------------------
  {
    id: 'citrulline_bulk_300',
    brand: 'BulkNutrition',
    productName: 'L-Citrulline Malate 2:1 (300g)',
    imageUrl: '/products/citrulline_bulk_300',
    labelImageUrl: '/labels/citrulline_bulk_300',
    totalPriceUSD: 27.99,
    servingsPerContainer: 50,
    activeIngredients: [
      { name: 'L-Citrulline Malate', amountPerServingGrams: 6.0, purityPercentage: 98.0 },
    ],
    subscribeAndSaveDiscountPct: 15,
    checkoutUrl: 'https://example-merchant.test/p/citrulline_bulk_300',
    vendorName: 'iHerb Direct',
    ingredientFamily: 'L-Citrulline',
    servingSizeGrams: 6.2,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide'],
  },
  {
    id: 'citrulline_peakform_200',
    brand: 'PeakForm',
    productName: 'L-Citrulline Malate (200g)',
    imageUrl: '/products/citrulline_peakform_200',
    labelImageUrl: '/labels/citrulline_peakform_200',
    totalPriceUSD: 24.99,
    servingsPerContainer: 40,
    activeIngredients: [
      { name: 'L-Citrulline Malate', amountPerServingGrams: 5.0, purityPercentage: 97.5 },
    ],
    subscribeAndSaveDiscountPct: 12,
    checkoutUrl: 'https://example-merchant.test/p/citrulline_peakform_200',
    vendorName: 'Vendor Direct',
    ingredientFamily: 'L-Citrulline',
    servingSizeGrams: 5.2,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide', 'Natural flavor'],
  },
  {
    id: 'prop_pumpblend',
    brand: 'VitalRoot',
    productName: 'Pump Blend Complex (25 servings)',
    imageUrl: '/products/prop_pumpblend',
    labelImageUrl: '/labels/prop_pumpblend',
    totalPriceUSD: 34.99,
    servingsPerContainer: 25,
    activeIngredients: [
      { name: 'L-Citrulline Malate', amountPerServingGrams: 3.0, purityPercentage: 70 },
    ],
    subscribeAndSaveDiscountPct: 8,
    checkoutUrl: 'https://example-merchant.test/p/prop_pumpblend',
    vendorName: 'Amazon',
    ingredientFamily: 'L-Citrulline',
    servingSizeGrams: 6.5,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide', 'Sucralose'],
    proprietaryBlend: {
      name: 'Pump Matrix™ Proprietary Blend',
      totalMg: 5000,
      components: [
        'Maltodextrin',
        'L-Citrulline Malate',
        'Beet Root Powder',
        'Taurine',
        'Natural Flavor',
      ],
    },
    fillerCallouts: [
      'Proprietary "Pump Matrix" — no per-ingredient amounts disclosed',
      'Citrulline dose below the 6g clinical threshold',
    ],
  },

  // --- Whey Protein ---------------------------------------------------------
  {
    id: 'whey_cleanwhey_2lb',
    brand: 'CleanWhey',
    productName: 'Whey Protein Isolate (2lb)',
    imageUrl: '/products/whey_cleanwhey_2lb',
    labelImageUrl: '/labels/whey_cleanwhey_2lb',
    totalPriceUSD: 49.99,
    servingsPerContainer: 30,
    activeIngredients: [
      { name: 'Whey Protein Isolate', amountPerServingGrams: 25.0, purityPercentage: 90.0 },
    ],
    subscribeAndSaveDiscountPct: 20,
    checkoutUrl: 'https://example-merchant.test/p/whey_cleanwhey_2lb',
    vendorName: 'Amazon',
    ingredientFamily: 'Whey Protein',
    servingSizeGrams: 28.0,
    servingUnit: '1 scoop',
    otherIngredients: ['Sunflower lecithin', 'Natural flavor', 'Stevia leaf extract'],
  },
  {
    id: 'whey_massline_2lb',
    brand: 'MassLine',
    productName: 'Whey Protein Concentrate (2lb)',
    imageUrl: '/products/whey_massline_2lb',
    labelImageUrl: '/labels/whey_massline_2lb',
    totalPriceUSD: 34.99,
    servingsPerContainer: 28,
    activeIngredients: [
      { name: 'Whey Protein Concentrate', amountPerServingGrams: 22.0, purityPercentage: 78.0 },
    ],
    subscribeAndSaveDiscountPct: 15,
    checkoutUrl: 'https://example-merchant.test/p/whey_massline_2lb',
    vendorName: 'Bodybuilding.com',
    ingredientFamily: 'Whey Protein',
    servingSizeGrams: 32.0,
    servingUnit: '1 scoop',
    otherIngredients: ['Glycine', 'Taurine', 'Sunflower lecithin', 'Natural flavor', 'Sucralose'],
    fillerCallouts: ['Amino spiking: glycine and taurine boost nitrogen-based protein claims'],
  },
  {
    id: 'whey_peakform_5lb',
    brand: 'PeakForm',
    productName: 'Grass-Fed Whey Isolate (5lb)',
    imageUrl: '/products/whey_peakform_5lb',
    labelImageUrl: '/labels/whey_peakform_5lb',
    totalPriceUSD: 109.99,
    servingsPerContainer: 76,
    activeIngredients: [
      { name: 'Whey Protein Isolate', amountPerServingGrams: 25.0, purityPercentage: 91.0 },
    ],
    subscribeAndSaveDiscountPct: 18,
    checkoutUrl: 'https://example-merchant.test/p/whey_peakform_5lb',
    vendorName: 'Vendor Direct',
    ingredientFamily: 'Whey Protein',
    servingSizeGrams: 28.0,
    servingUnit: '1 scoop',
    otherIngredients: ['Sunflower lecithin', 'Natural flavor', 'Stevia leaf extract'],
  },

  // --- Beta-Alanine ---------------------------------------------------------
  {
    id: 'betaalanine_bulk_200',
    brand: 'BulkNutrition',
    productName: 'Beta-Alanine (200g)',
    imageUrl: '/products/betaalanine_bulk_200',
    labelImageUrl: '/labels/betaalanine_bulk_200',
    totalPriceUSD: 19.99,
    servingsPerContainer: 62,
    activeIngredients: [
      { name: 'Beta-Alanine', amountPerServingGrams: 3.2, purityPercentage: 99.0 },
    ],
    subscribeAndSaveDiscountPct: 15,
    checkoutUrl: 'https://example-merchant.test/p/betaalanine_bulk_200',
    vendorName: 'iHerb Direct',
    ingredientFamily: 'Beta-Alanine',
    servingSizeGrams: 3.3,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide'],
  },
  {
    id: 'betaalanine_peakform_100',
    brand: 'PeakForm',
    productName: 'Beta-Alanine (100g)',
    imageUrl: '/products/betaalanine_peakform_100',
    labelImageUrl: '/labels/betaalanine_peakform_100',
    totalPriceUSD: 14.99,
    servingsPerContainer: 31,
    activeIngredients: [
      { name: 'Beta-Alanine', amountPerServingGrams: 3.2, purityPercentage: 98.5 },
    ],
    subscribeAndSaveDiscountPct: 10,
    checkoutUrl: 'https://example-merchant.test/p/betaalanine_peakform_100',
    vendorName: 'Amazon',
    ingredientFamily: 'Beta-Alanine',
    servingSizeGrams: 3.3,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide'],
  },
  {
    id: 'prop_endurance_matrix',
    brand: 'ApexLabs',
    productName: 'Endurance Matrix™ (30 servings)',
    imageUrl: '/products/prop_endurance_matrix',
    labelImageUrl: '/labels/prop_endurance_matrix',
    totalPriceUSD: 39.99,
    servingsPerContainer: 30,
    activeIngredients: [
      { name: 'Beta-Alanine', amountPerServingGrams: 1.6, purityPercentage: 55 },
    ],
    subscribeAndSaveDiscountPct: 5,
    checkoutUrl: 'https://example-merchant.test/p/prop_endurance_matrix',
    vendorName: 'Bodybuilding.com',
    ingredientFamily: 'Beta-Alanine',
    servingSizeGrams: 7.0,
    servingUnit: '1 scoop',
    otherIngredients: ['Silicon dioxide', 'Sucralose'],
    proprietaryBlend: {
      name: 'Endurance Matrix™ Proprietary Blend',
      totalMg: 5500,
      components: [
        'Rice Flour',
        'Maltodextrin',
        'Beta-Alanine',
        'Taurine',
        'Caffeine Anhydrous',
        'Natural Flavor',
      ],
    },
    fillerCallouts: [
      'Proprietary blend — beta-alanine amount not individually disclosed',
      'Half the 3.2g dose used in clinical studies',
      'Rice flour listed before the active ingredient',
    ],
  },

  // --- Electrolytes ---------------------------------------------------------
  {
    id: 'electrolytes_hydrasalt_30',
    brand: 'HydraSalt',
    productName: 'Electrolytes Complex (30 servings)',
    imageUrl: '/products/electrolytes_hydrasalt_30',
    labelImageUrl: '/labels/electrolytes_hydrasalt_30',
    totalPriceUSD: 24.99,
    servingsPerContainer: 30,
    activeIngredients: [
      { name: 'Sodium Chloride', amountPerServingGrams: 2.0, purityPercentage: 97.0 },
      { name: 'Potassium Citrate', amountPerServingGrams: 1.0, purityPercentage: 95.0 },
      { name: 'Magnesium Malate', amountPerServingGrams: 0.5, purityPercentage: 94.0 },
    ],
    subscribeAndSaveDiscountPct: 15,
    checkoutUrl: 'https://example-merchant.test/p/electrolytes_hydrasalt_30',
    vendorName: 'iHerb Direct',
    ingredientFamily: 'Electrolytes',
    servingSizeGrams: 4.0,
    servingUnit: '1 stick pack',
    otherIngredients: ['Citric acid', 'Natural flavor', 'Stevia leaf extract'],
  },
  {
    id: 'electrolytes_vitalroot_60',
    brand: 'VitalRoot',
    productName: 'Daily Electrolytes (60 servings)',
    imageUrl: '/products/electrolytes_vitalroot_60',
    labelImageUrl: '/labels/electrolytes_vitalroot_60',
    totalPriceUSD: 34.99,
    servingsPerContainer: 60,
    activeIngredients: [
      { name: 'Sodium Chloride', amountPerServingGrams: 1.8, purityPercentage: 96.0 },
      { name: 'Potassium Citrate', amountPerServingGrams: 0.8, purityPercentage: 94.0 },
      { name: 'Magnesium Malate', amountPerServingGrams: 0.4, purityPercentage: 93.0 },
    ],
    subscribeAndSaveDiscountPct: 20,
    checkoutUrl: 'https://example-merchant.test/p/electrolytes_vitalroot_60',
    vendorName: 'Vendor Direct',
    ingredientFamily: 'Electrolytes',
    servingSizeGrams: 3.5,
    servingUnit: '1 stick pack',
    otherIngredients: ['Citric acid', 'Natural flavor', 'Monk fruit extract'],
  },
  {
    id: 'electrolytes_peakform_20',
    brand: 'PeakForm',
    productName: 'Hydration Sticks (20 servings)',
    imageUrl: '/products/electrolytes_peakform_20',
    labelImageUrl: '/labels/electrolytes_peakform_20',
    totalPriceUSD: 21.99,
    servingsPerContainer: 20,
    activeIngredients: [
      { name: 'Sodium Chloride', amountPerServingGrams: 1.5, purityPercentage: 95.0 },
      { name: 'Potassium Citrate', amountPerServingGrams: 0.9, purityPercentage: 92.0 },
      { name: 'Magnesium Malate', amountPerServingGrams: 0.4, purityPercentage: 91.0 },
    ],
    subscribeAndSaveDiscountPct: 10,
    checkoutUrl: 'https://example-merchant.test/p/electrolytes_peakform_20',
    vendorName: 'Amazon',
    ingredientFamily: 'Electrolytes',
    servingSizeGrams: 6.0,
    servingUnit: '1 stick pack',
    otherIngredients: ['Cane sugar', 'Citric acid', 'Natural flavor'],
    fillerCallouts: ['Added cane sugar exceeds total electrolyte content per stick'],
  },
];

/** Every distinct ingredient family in the catalog. */
export const INGREDIENT_FAMILIES: string[] = [
  ...new Set(SUPPLEMENT_CATALOG.map((e) => e.ingredientFamily)),
];

export function findCatalogEntryByLabelUrl(labelImageUrl: string): CatalogEntry | undefined {
  return SUPPLEMENT_CATALOG.find((e) => e.labelImageUrl === labelImageUrl);
}

export function findCatalogEntryById(id: string): CatalogEntry | undefined {
  return SUPPLEMENT_CATALOG.find((e) => e.id === id);
}

/**
 * Matches a user's free-text target ("Creatine Monohydrate (500g)", "creatine")
 * against a catalog ingredient family. Teammate 1's stack builder lets users
 * type arbitrary strings, so this has to be forgiving in both directions.
 */
export function matchIngredientFamily(query: string): string | undefined {
  const q = query.toLowerCase().replace(/\(.*?\)/g, '').trim();
  if (!q) return undefined;

  const exact = INGREDIENT_FAMILIES.find((f) => f.toLowerCase() === q);
  if (exact) return exact;

  return INGREDIENT_FAMILIES.find((f) => {
    const fam = f.toLowerCase();
    return q.includes(fam) || fam.includes(q);
  });
}
