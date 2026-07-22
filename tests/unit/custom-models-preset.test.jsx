import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Mirrors CustomModelsModal PresetField: Custom… must reveal a free-form input
 * even when the current value already matches a preset.
 */
function PresetField({ label, value, presets, onChange }) {
  const [customMode, setCustomMode] = useState(
    () => String(value || '') !== '' && !presets.includes(String(value)),
  );
  const inPresets = !customMode && presets.includes(String(value));
  const selectValue = inPresets ? String(value) : '__custom__';

  return (
    <label>
      <span>{label}</span>
      <select
        data-testid="preset-select"
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === '__custom__') {
            setCustomMode(true);
            if (!value || Number.isNaN(Number(value))) onChange(presets[0]);
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>
      {!inPresets ? (
        <input
          data-testid="preset-custom-input"
          type="number"
          value={value}
          onChange={(event) => {
            setCustomMode(true);
            onChange(event.target.value);
          }}
        />
      ) : null}
    </label>
  );
}

function Harness({ initial = '128000', presets = ['128000', '256000', '1000000'] }) {
  const [value, setValue] = useState(initial);
  return <PresetField label="maxInput" value={value} presets={presets} onChange={setValue} />;
}

describe('custom model PresetField', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('shows free-form input after choosing Custom… even when value is a preset', async () => {
    await act(async () => {
      root.render(<Harness initial="128000" />);
    });
    expect(container.querySelector('[data-testid="preset-custom-input"]')).toBeNull();

    const select = container.querySelector('[data-testid="preset-select"]');
    await act(async () => {
      select.value = '__custom__';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const input = container.querySelector('[data-testid="preset-custom-input"]');
    expect(input).toBeTruthy();

    await act(async () => {
      input.value = '400000';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="preset-custom-input"]').value).toBe('400000');
  });

  it('opens in custom mode when draft value is not in presets', async () => {
    await act(async () => {
      root.render(<Harness initial="400000" />);
    });
    const input = container.querySelector('[data-testid="preset-custom-input"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('400000');
  });
});
