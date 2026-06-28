// Referrer code sorting — numeric codes first, then alphabetical.

export const sortReferrerCodes = (a, b) => {
  const codeA = String(a.code).trim();
  const codeB = String(b.code).trim();
  const numA = parseInt(codeA, 10);
  const numB = parseInt(codeB, 10);

  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return codeA.localeCompare(codeB, "he");
};
