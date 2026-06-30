import type { Dispatch, SetStateAction } from "react";
import type {
  ThemePreset,
  ThemeTokenControl,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
} from "../lib/app-types";
import { cssColorToHex } from "../lib/settings";
import {
  calloutIconOptions,
  calloutKinds,
  calloutStyleOptions,
  defaultThemeCalloutSettings,
  normalizeCalloutIcon,
  normalizeCalloutStyle,
  sameThemeTokens,
  themePresets,
  themeTokenGroups,
} from "./theme-options";

type ThemeBuilderPanelProps = {
  selectedThemePresetIdDraft: string | null;
  themeCalloutDraft: VaultThemeCalloutSettings;
  themeDraft: Record<string, string>;
  themeOptionsDraft: VaultThemeOptions;
  vaultRoot: string;
  onApplyThemePreset: (preset: ThemePreset) => void;
  onResetThemeDraft: () => void;
  onSetThemeCalloutDraft: Dispatch<SetStateAction<VaultThemeCalloutSettings>>;
  onSetThemeOptionsDraft: Dispatch<SetStateAction<VaultThemeOptions>>;
  onUpdateThemeDraftToken: (token: string, value: string) => void;
};

export function ThemeBuilderPanel({
  selectedThemePresetIdDraft,
  themeCalloutDraft,
  themeDraft,
  themeOptionsDraft,
  vaultRoot,
  onApplyThemePreset,
  onResetThemeDraft,
  onSetThemeCalloutDraft,
  onSetThemeOptionsDraft,
  onUpdateThemeDraftToken,
}: ThemeBuilderPanelProps) {
  function themeTokenValue(token: string) {
    return cssColorToHex(
      themeDraft[token] ??
        window.getComputedStyle(document.documentElement).getPropertyValue(token),
    );
  }

  function rawThemeTokenValue(control: ThemeTokenControl) {
    return (
      themeDraft[control.token] ??
      window.getComputedStyle(document.documentElement).getPropertyValue(control.token).trim() ??
      control.placeholder ??
      ""
    );
  }

  return (
    <>
      <section className="settings-section" aria-label="Theme templates">
        <div className="settings-section-header">
          <div>
            <h3>Theme Templates</h3>
            <p>Apply a complete color system, then refine individual tokens below.</p>
          </div>
        </div>
        <div className="theme-preset-grid">
          {themePresets.map((preset) => (
            <button
              className={
                selectedThemePresetIdDraft === preset.id ||
                sameThemeTokens(themeDraft, preset.tokens)
                  ? "theme-preset-card active"
                  : "theme-preset-card"
              }
              disabled={!vaultRoot}
              key={preset.id}
              type="button"
              onClick={() => onApplyThemePreset(preset)}
            >
              <span className="theme-preset-swatches" aria-hidden="true">
                <i style={{ background: preset.tokens["--glyphary-app-bg"] }} />
                <i style={{ background: preset.tokens["--glyphary-surface"] }} />
                <i style={{ background: preset.tokens["--glyphary-accent"] }} />
                <i style={{ background: preset.tokens["--glyphary-code-bg"] }} />
              </span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section" aria-label="Theme options">
        <div className="settings-section-header">
          <div>
            <h3>Theme Options</h3>
            <p>Apply optional editor treatments on top of the selected theme.</p>
          </div>
        </div>
        <label className="settings-check-control">
          <input
            checked={themeOptionsDraft.colorfulHeadings}
            disabled={!vaultRoot}
            type="checkbox"
            onChange={(event) => {
              const colorfulHeadings = event.currentTarget.checked;

              onSetThemeOptionsDraft((options) => ({
                ...options,
                colorfulHeadings,
              }));
            }}
          />
          <span>Use colorful heading levels</span>
        </label>
        <label className="settings-check-control">
          <input
            checked={themeOptionsDraft.headingUnderlines}
            disabled={!vaultRoot}
            type="checkbox"
            onChange={(event) => {
              const headingUnderlines = event.currentTarget.checked;

              onSetThemeOptionsDraft((options) => ({
                ...options,
                headingUnderlines,
              }));
            }}
          />
          <span>Add heading underlines</span>
        </label>
        <label className="settings-check-control">
          <input
            checked={themeOptionsDraft.headingAnchors}
            disabled={!vaultRoot}
            type="checkbox"
            onChange={(event) => {
              const headingAnchors = event.currentTarget.checked;

              onSetThemeOptionsDraft((options) => ({
                ...options,
                headingAnchors,
              }));
            }}
          />
          <span>Show heading anchor markers</span>
        </label>
        <label className="settings-check-control">
          <input
            checked={themeOptionsDraft.richCallouts}
            disabled={!vaultRoot}
            type="checkbox"
            onChange={(event) => {
              const richCallouts = event.currentTarget.checked;

              onSetThemeOptionsDraft((options) => ({
                ...options,
                richCallouts,
              }));
            }}
          />
          <span>Use rich callout styling and icons</span>
        </label>
      </section>
      <section className="settings-section" aria-label="Callout rendering">
        <div className="settings-section-header">
          <div>
            <h3>Callout Rendering</h3>
            <p>Choose a structured callout layout and icons for this vault theme.</p>
          </div>
        </div>
        <label>
          <span>Callout layout</span>
          <select
            disabled={!vaultRoot}
            value={themeCalloutDraft.style}
            onChange={(event) => {
              const style = normalizeCalloutStyle(event.currentTarget.value);

              onSetThemeCalloutDraft((settings) => ({
                ...settings,
                style,
              }));
            }}
          >
            {calloutStyleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="callout-icon-grid">
          {calloutKinds.map((kind) => (
            <label key={kind.value}>
              <span>{kind.label} icon</span>
              <select
                disabled={!vaultRoot}
                value={themeCalloutDraft.icons[kind.value]}
                onChange={(event) => {
                  const icon = normalizeCalloutIcon(
                    event.currentTarget.value,
                    defaultThemeCalloutSettings.icons[kind.value],
                  );

                  onSetThemeCalloutDraft((settings) => ({
                    ...settings,
                    icons: {
                      ...settings.icons,
                      [kind.value]: icon,
                    },
                  }));
                }}
              >
                {calloutIconOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>
      <section className="settings-section" aria-label="Theme builder">
        <div className="settings-section-header">
          <div>
            <h3>Theme Builder</h3>
            <p>Changes preview immediately and are saved to this vault.</p>
          </div>
          <button
            className="inline-action"
            disabled={!vaultRoot || Object.keys(themeDraft).length === 0}
            type="button"
            onClick={onResetThemeDraft}
          >
            Reset Theme
          </button>
        </div>
        <div className="theme-builder">
          {themeTokenGroups.map((group) => (
            <fieldset className="theme-token-group" disabled={!vaultRoot} key={group.title}>
              <legend>{group.title}</legend>
              {group.controls.map((control) => (
                <label className="theme-token-control" key={control.token}>
                  <span>{control.label}</span>
                  <div>
                    {control.kind === "value" ? (
                      <input
                        aria-label={control.label}
                        type="text"
                        value={rawThemeTokenValue(control)}
                        placeholder={control.placeholder}
                        onChange={(event) =>
                          onUpdateThemeDraftToken(control.token, event.currentTarget.value)
                        }
                      />
                    ) : (
                      <input
                        aria-label={control.label}
                        type="color"
                        value={themeTokenValue(control.token)}
                        onChange={(event) =>
                          onUpdateThemeDraftToken(control.token, event.currentTarget.value)
                        }
                      />
                    )}
                    <code>{control.token}</code>
                  </div>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </section>
    </>
  );
}
