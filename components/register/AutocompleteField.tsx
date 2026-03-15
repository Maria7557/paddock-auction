"use client";

import styles from "./AutocompleteField.module.css";

type Props = {
  helperText?: string;
  label: string;
  listId: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
};

export function AutocompleteField({
  helperText,
  label,
  listId,
  onChange,
  placeholder,
  required = false,
  value,
}: Props) {
  return (
    <label className={styles.field}>
      {label}
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {helperText ? <p className={styles.helper}>{helperText}</p> : null}
    </label>
  );
}
