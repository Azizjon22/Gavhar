import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import type { PermissionGroup } from '../types/role.types';

interface PermissionMatrixProps {
  catalog: PermissionGroup[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Ruxsatlar jadvali: resurs bo'yicha guruhlangan, har guruhni birdan belgilash mumkin. */
export function PermissionMatrix({ catalog, value, onChange, disabled }: PermissionMatrixProps) {
  const { t } = useTranslation();
  const selected = new Set(value);

  const setKeys = (keys: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    // Katalog tartibida — audit logda farq (diff) barqaror chiqishi uchun.
    onChange(
      catalog.flatMap((group) => group.permissions.map((p) => p.key)).filter((k) => next.has(k)),
    );
  };

  return (
    <div className="grid max-h-[42dvh] gap-1 overflow-y-auto rounded-xl border p-1.5">
      {catalog.map((group) => {
        const keys = group.permissions.map((permission) => permission.key);
        const count = keys.filter((key) => selected.has(key)).length;
        const groupState = count === 0 ? false : count === keys.length ? true : 'indeterminate';

        return (
          <fieldset
            key={group.resource}
            disabled={disabled}
            className="rounded-lg p-3 transition-colors hover:bg-muted/50"
          >
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
              <Checkbox
                checked={groupState}
                onCheckedChange={() => setKeys(keys, groupState !== true)}
              />
              {t(`permissions.resources.${group.resource}`, { defaultValue: group.resource })}
              <span className="tabular ml-auto text-xs font-medium text-muted-foreground">
                {count}/{keys.length}
              </span>
            </label>
            <div className="mt-3 grid gap-x-4 gap-y-2.5 pl-[30px] sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label
                  key={permission.key}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground has-[[data-state=checked]]:text-foreground"
                >
                  <Checkbox
                    checked={selected.has(permission.key)}
                    onCheckedChange={(checked) => setKeys([permission.key], checked === true)}
                  />
                  {t(`permissions.actions.${permission.action}`, {
                    defaultValue: permission.description,
                  })}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
