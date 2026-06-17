/**
 * Date-template expansion helpers.
 *
 * Responsibilities:
 * - Expand Glyphary's `{{date:...}}` placeholders for tidbit and file-path templates.
 * - Provide the timestamp format used by pasted assets and Excalidraw files.
 *
 * Contracts:
 * - `MM` means month and `mm` means minutes, except for the legacy tidbit pattern
 *   compatibility described in `expandDateFormat`.
 * - Helpers are deterministic for a supplied `Date` and must not read application state.
 */

type DateTemplateParts = {
  YYYY: string;
  YY: string;
  MM: string;
  DD: string;
  HH: string;
  hh: string;
  mm: string;
  ss: string;
};

function dateTemplateParts(date: Date): DateTemplateParts {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear().toString();

  return {
    YYYY: year,
    YY: year.slice(-2),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    hh: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
}

export function expandDateFormat(format: string, date = new Date()) {
  const parts = dateTemplateParts(date);

  // Compatibility for the original tidbit default. Standard tokens use MM for
  // month and mm for minutes, but the requested default used lowercase mm in
  // the date position. Keep that pattern stable while encouraging MM elsewhere.
  const compatibleFormat = format
    .replace(/YYYY-mm-DD/g, "YYYY-MM-DD")
    .replace(/YY-mm-DD/g, "YY-MM-DD");

  return compatibleFormat.replace(
    /YYYY|YY|MM|DD|HH|hh|mm|ss/g,
    (token) => parts[token as keyof DateTemplateParts],
  );
}

export function expandDateTemplate(template: string, date = new Date()) {
  return template.replace(/\{\{date:([^}]+)\}\}/g, (_match, format: string) =>
    expandDateFormat(format, date),
  );
}

export function timestampForAssetName(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
