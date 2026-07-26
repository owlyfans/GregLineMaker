/** Where recipes.json/icons.json/icon PNGs are actually published - see the GregLineMakerResources
 * repo (published via GitHub Pages, separate from this app's own repo/deploy since it's ~110MB of
 * regenerable pipeline output, not hand-written source). */
export const RESOURCES_BASE_URL = "https://owlyfans.github.io/GregLineMakerResources";

/** Modpack revisions with a recipe dump published under RESOURCES_BASE_URL/<version>/recipes.json.
 * Recipes shift across pack updates (mods added/removed/bumped); icons.json/icons/ stay shared at
 * the resources repo's root since item ids - and therefore icon URLs - don't change underneath an
 * existing id. Keep in sync with pipeline/build.mjs's MODPACK_VERSION default and the corresponding
 * mod/ + main-repo branch per version. */
export const MODPACK_VERSIONS = ["0.13.5", "0.13.4"] as const;
export type ModpackVersion = (typeof MODPACK_VERSIONS)[number];
export const DEFAULT_MODPACK_VERSION: ModpackVersion = MODPACK_VERSIONS[0];

export function recipesUrl(version: ModpackVersion): string {
  return `${RESOURCES_BASE_URL}/${version}/recipes.json`;
}
