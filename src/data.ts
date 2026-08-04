/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Translations and helpers specifically for fleet transportation & expenses
export const TRANSLATE_EXPENSE_CATEGORY: Record<string, string> = {
  "Fuel": "وقود ومحروقات",
  "Spare Parts": "قطع غيار وميكانيك",
  "Fines": "غرامات ومخالفات الطرق",
  "Admin": "مصاريف إدارية ومكتبية"
};

export const EXPENSE_CATEGORIES = [
  { value: "Fuel", label: "وقود ومحروقات" },
  { value: "Spare Parts", label: "قطع غيار وميكانيك" },
  { value: "Fines", label: "غرامات ومخالفات الطرق" },
  { value: "Admin", label: "مصاريف إدارية ومكتبية" }
];
