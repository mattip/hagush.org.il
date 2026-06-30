// Fuzzy matching for referrer codes and names

const levenshteinDistance = (a, b) => {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const aLen = aLower.length;
  const bLen = bLower.length;
  const matrix = Array(bLen + 1)
    .fill(null)
    .map(() => Array(aLen + 1).fill(0));

  for (let i = 0; i <= aLen; i++) matrix[0][i] = i;
  for (let j = 0; j <= bLen; j++) matrix[j][0] = j;

  for (let j = 1; j <= bLen; j++) {
    for (let i = 1; i <= aLen; i++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1
        );
      }
    }
  }

  return matrix[bLen][aLen];
};

const calculateSimilarity = (a, b) => {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
};

export const findReferrerMatches = (csvReferrer, referrerMap) => {
  if (!csvReferrer || !csvReferrer.trim()) {
    return { matches: [], csvReferrer };
  }

  const candidates = Array.from(referrerMap.entries())
    .map(([code, ref]) => {
      const nameScore = calculateSimilarity(csvReferrer, ref.name);
      const codeScore = calculateSimilarity(csvReferrer, code);
      const maxScore = Math.max(nameScore, codeScore);
      return { code, name: ref.name, score: maxScore, source: nameScore >= codeScore ? 'name' : 'code' };
    })
    .filter(m => m.score > 0.5)
    .sort((a, b) => b.score - a.score);

  return { matches: candidates, csvReferrer };
};

export const getReferrerMatchQuality = (score) => {
  if (score > 0.85) return 'high';
  if (score > 0.65) return 'medium';
  return 'low';
};
