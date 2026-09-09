import { Select } from './ui/Field'
import { locationGroups, type Location } from '../data/locations'

/**
 * Choosing a store.
 *
 * Sixty-six names in one flat list is unusable: you cannot tell a dealer from a
 * main store, and the one you want is somewhere in the middle. They are grouped
 * under the client's own headings from "Legendary Stores for CRM" — the same
 * words on the same list, so the CRM and their spreadsheet read alike.
 */
export function StorePicker({
  value,
  onChange,
  only,
  className = '',
  id,
}: {
  value: string
  onChange: (locationId: string) => void
  /** Narrows what appears — the stock screen only wants places that hold stock. */
  only?: (l: Location) => boolean
  className?: string
  id?: string
}) {
  const groups = locationGroups(
    only ? (l) => l.status === 'open' && only(l) : undefined,
  )

  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {groups.map((g) => (
        <optgroup key={g.channel} label={g.heading}>
          {g.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
