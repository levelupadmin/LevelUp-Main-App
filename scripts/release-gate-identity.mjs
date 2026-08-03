function exactSubjectCommits(history, subject) {
  const commits = [];
  for (const line of String(history || "").split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab === -1 || line.slice(tab + 1) !== subject) continue;
    commits.push(line.slice(0, tab));
  }
  return commits;
}

/** Prefer the historical first-parent contract, with a merge-safe fallback. */
export function selectIdentityMarker({ firstParentHistory, ancestryHistory, subject }) {
  const firstParentMatches = exactSubjectCommits(firstParentHistory, subject);
  if (firstParentMatches.length > 1) {
    throw new Error(
      `first-parent history contains ${firstParentMatches.length} exact identity markers: ${firstParentMatches.join(", ")}.`,
    );
  }
  if (firstParentMatches.length === 1) {
    return { commit: firstParentMatches[0], source: "first-parent" };
  }

  const ancestryMatches = exactSubjectCommits(ancestryHistory, subject);
  if (ancestryMatches.length === 0) {
    throw new Error(`HEAD ancestry contains no exact identity marker ${JSON.stringify(subject)}.`);
  }
  if (ancestryMatches.length > 1) {
    throw new Error(
      `HEAD ancestry contains ${ancestryMatches.length} exact identity markers: ${ancestryMatches.join(", ")}.`,
    );
  }

  return { commit: ancestryMatches[0], source: "ancestry" };
}
