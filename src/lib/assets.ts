/**
 * Vault asset naming and validation helpers.
 *
 * Responsibilities:
 * - Recognize supported dropped/pasted image files.
 * - Produce markdown-visible asset and drawing filenames using Glyphary's timestamp convention.
 *
 * Contracts:
 * - These helpers operate on file-like metadata only; the backend still validates bytes and paths.
 * - Generated names must remain stable because they are inserted directly into markdown.
 */

import { timestampForAssetName } from "./dates.js";

const supportedImageTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

type ImageFileLike = {
  name: string;
  type: string;
};

export function imageExtensionForFile(file: ImageFileLike) {
  const mimeExtension = supportedImageTypes.get(file.type);

  if (mimeExtension) {
    return mimeExtension;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)
    ? extension
    : "png";
}

export function isSupportedImageFile(file: ImageFileLike) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    supportedImageTypes.has(file.type) ||
    (!!extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension))
  );
}

export function sanitizeAssetNameStem(fileName: string) {
  const withoutPath = fileName.split(/[/\\]/).pop() ?? "";
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .replace(/[^\w\s.-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  if (!sanitized || /^image$/i.test(sanitized)) {
    return "Pasted image";
  }

  return sanitized;
}

export function fileNameForDroppedImage(file: ImageFileLike, date = new Date()) {
  const stem = sanitizeAssetNameStem(file.name);
  const extension = imageExtensionForFile(file);

  return `${stem} ${timestampForAssetName(date)}.${extension}`;
}

export function sanitizeDrawingName(value: string) {
  const sanitized = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\s.-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  return sanitized || "Drawing";
}

export function excalidrawFileNameForTitle(title: string, date = new Date()) {
  return `${sanitizeDrawingName(title)} ${timestampForAssetName(date)}.excalidraw`;
}
