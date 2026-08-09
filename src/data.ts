/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { T } from "./strings";

// Translations and helpers specifically for fleet transportation & expenses.
// The Arabic labels themselves live in src/strings.ts (T.expenseCategory) so
// all user-visible wording stays in one place.
export const TRANSLATE_EXPENSE_CATEGORY: Record<string, string> = {
  "Fuel": T.expenseCategory.fuel,
  "Spare Parts": T.expenseCategory.spareParts,
  "Fines": T.expenseCategory.fines,
  "Admin": T.expenseCategory.admin
};

export const EXPENSE_CATEGORIES = [
  { value: "Fuel", label: T.expenseCategory.fuel },
  { value: "Spare Parts", label: T.expenseCategory.spareParts },
  { value: "Fines", label: T.expenseCategory.fines },
  { value: "Admin", label: T.expenseCategory.admin }
];
