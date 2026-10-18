// Right-side drawer listing every job field (and optionally cities), opened by
// a button. Built on the native `popover` attribute: no client JS, and the
// links are in the server HTML for crawlers while staying out of the way.
// Usable from server and client components alike (no hooks).

import Link from 'next/link';
import { X } from 'lucide-react';
import { categorySlug } from '@/utils/categorize';
import './listing.css';

export interface DrawerField { name: string; count: number }
export interface DrawerCity { slug: string; label: string; total?: number }

const fieldLabel = (name: string) =>
  name === 'Other / General Business' ? 'General business'
  : name === 'Other / Open Application' ? 'Open applications'
  : name;

export default function FieldsDrawer({
  id, title, fields, cities = [], current, currentCity, citiesFirst = false,
}: {
  id: string;
  title: string;
  fields: DrawerField[];
  cities?: DrawerCity[];
  /** Field to mark as the current page. */
  current?: string;
  /** City slug to mark as the current page. */
  currentCity?: string;
  /** List cities above fields (city pages). */
  citiesFirst?: boolean;
}) {
  const fieldBlock = (
    <>
      <p className="ls-drawer-label">Fields</p>
      <ul className="ls-drawer-list">
        {fields.map(field => (
          <li key={field.name}>
            <Link href={`/category/${categorySlug(field.name)}`} aria-current={field.name === current ? 'page' : undefined}>
              <span>{fieldLabel(field.name)}</span>
              {field.count > 0 && <span className="ls-drawer-count">{field.count.toLocaleString('en-US')}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
  const cityBlock = cities.length > 0 ? (
    <>
      <p className="ls-drawer-label">Cities</p>
      <ul className="ls-drawer-list" data-cols="2">
        {cities.map(city => (
          <li key={city.slug}>
            <Link href={`/city/${city.slug}`} aria-current={city.slug === currentCity ? 'page' : undefined}>
              <span>{city.label}</span>
              {city.total ? <span className="ls-drawer-count">{city.total.toLocaleString('en-US')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  ) : null;

  return (
    <div id={id} popover="auto" className="ls-drawer" aria-label={title}>
      <div className="ls-drawer-head">
        <p className="ls-drawer-title">{title}</p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="ls-drawer-close" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {citiesFirst ? <>{cityBlock}{fieldBlock}</> : <>{fieldBlock}{cityBlock}</>}
    </div>
  );
}
