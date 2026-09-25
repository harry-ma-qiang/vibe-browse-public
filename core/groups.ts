/**
 * Putting tabs into groups, which is the one thing here that is not about a tree.
 *
 * An agent working through a task opens pages as it goes. Grouping them is how the
 * person watching can tell one errand from another without reading every title.
 */

/** The colours Chrome will accept for a group, and the whole of them. */
export const COLOURS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
] as const;

/** One of the colours Chrome accepts. */
export type Colour = (typeof COLOURS)[number];

/** A group as a reader sees it: its name and its tabs. */
export interface Group {
  id: number;
  title: string;
  colour: Colour;
  tabIds: number[];
}

/** Put these tabs in a group, making one if no group has that title. */
export async function group(
  tabIds: [number, ...number[]],
  title: string,
  colour: Colour,
): Promise<number> {
  const [held] = await chrome.tabGroups.query({ title });
  const groupId = await chrome.tabs.group(
    held ? { tabIds, groupId: held.id } : { tabIds },
  );
  await chrome.tabGroups.update(groupId, { title, color: colour });
  return groupId;
}

/** Take these tabs out of whatever group holds them, leaving the tabs open. */
export async function ungroup(tabIds: [number, ...number[]]): Promise<void> {
  await chrome.tabs.ungroup(tabIds);
}

/** Every group in this window, with the tabs each one holds. */
export async function groups(): Promise<Group[]> {
  const held = await chrome.tabGroups.query({});
  return Promise.all(
    held.map(async (one) => ({
      id: one.id,
      title: one.title ?? '',
      colour: one.color as Colour,
      tabIds: (await chrome.tabs.query({ groupId: one.id })).flatMap((tab) =>
        tab.id === undefined ? [] : [tab.id],
      ),
    })),
  );
}
