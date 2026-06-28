// Referrers module rendering — groups, referrers list, and management forms.

import { getById } from "../../js/utils/dom.js";
import { renderGroupsSection } from "./sections/groups-section.render.js";
import { renderReferrersListSection } from "./sections/referrers-list-section.render.js";
import { renderSeedUploadSection } from "./sections/seed-upload-section.render.js";

export const renderReferrers = ({
  referrers,
  groups,
  groupCounts,
  referrerCounts,
  userRole,
}) => {
  const isAdmin = userRole === "admin";
  const seedSection = isAdmin ? renderSeedUploadSection() : "";
  const groupsSection = renderGroupsSection(groups, isAdmin, groupCounts, referrers);
  const referrersSection = renderReferrersListSection(referrers, {
    isAdmin,
    groups,
    referrerCounts,
  });

  getById("referrers-root").innerHTML =
    seedSection + groupsSection + referrersSection;
};
