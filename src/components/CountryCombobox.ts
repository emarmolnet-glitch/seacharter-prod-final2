import { UN_COUNTRIES, UN_COUNTRIES_BY_ISO, type UnCountry } from '../data/unCountries';

type CountryComboboxOptions = {
  defaultIso?: string;
  includeWorld?: boolean;
  inputLabel: string;
  inputSelector: string;
  listSelector: string;
  onChange?: (country: UnCountry) => void;
  root: HTMLElement;
};

export type CountryComboboxController = {
  destroy: () => void;
  getValue: () => string;
  selectIso: (iso: string) => boolean;
};

const MAX_VISIBLE_COUNTRIES = 10;
const WORLD_OPTION: UnCountry = { name: 'Mundo / World', iso2: '', iso3: 'WLD', m49: 0 };

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

function getCountryLabel(country: UnCountry): string {
  return `${country.name} · ${country.iso3}`;
}

function findCountries(query: string, includeWorld: boolean): readonly UnCountry[] {
  const availableCountries = includeWorld ? [WORLD_OPTION, ...UN_COUNTRIES] : UN_COUNTRIES;
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return availableCountries.slice(0, MAX_VISIBLE_COUNTRIES);

  return availableCountries.filter((country) => {
    const searchableValue = normalizeSearch(`${country.name} ${country.iso2} ${country.iso3} ${String(country.m49).padStart(3, '0')}`);
    return searchableValue.includes(normalizedQuery);
  }).slice(0, MAX_VISIBLE_COUNTRIES);
}

export function createCountryCombobox(options: CountryComboboxOptions): CountryComboboxController {
  const input = options.root.querySelector<HTMLInputElement>(options.inputSelector);
  const listbox = options.root.querySelector<HTMLElement>(options.listSelector);
  if (!input || !listbox) {
    return { destroy: () => undefined, getValue: () => '', selectIso: () => false };
  }

  let activeIndex = -1;
  let filteredCountries: readonly UnCountry[] = [];
  let selectedCountry: UnCountry | null = null;

  const closeListbox = () => {
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
  };

  const setActiveOption = (nextIndex: number) => {
    if (!filteredCountries.length) return;
    activeIndex = Math.max(0, Math.min(nextIndex, filteredCountries.length - 1));
    const optionsList = listbox.querySelectorAll<HTMLElement>('[role="option"]');
    optionsList.forEach((option, index) => {
      const isActive = index === activeIndex;
      option.setAttribute('aria-selected', String(isActive));
      option.classList.toggle('bg-cyan-50', isActive);
      option.classList.toggle('text-cyan-900', isActive);
      if (isActive) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const selectCountry = (country: UnCountry, notify = true) => {
    selectedCountry = country;
    Reflect.set(input, 'value', getCountryLabel(country));
    input.dataset.countryIso2 = country.iso2;
    input.dataset.countryIso3 = country.iso3;
    input.dataset.countryM49 = String(country.m49);
    closeListbox();
    if (notify) options.onChange?.(country);
  };

  const renderOptions = (query: string) => {
    filteredCountries = findCountries(query, options.includeWorld === true);
    listbox.replaceChildren();

    if (!filteredCountries.length) {
      const emptyOption = document.createElement('div');
      emptyOption.className = 'px-3 py-3 text-sm text-slate-500';
      emptyOption.textContent = 'No se encontraron países.';
      listbox.append(emptyOption);
    } else {
      filteredCountries.forEach((country, index) => {
        const option = document.createElement('div');
        option.id = `${listbox.id}-option-${index}`;
        option.className = 'flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-cyan-50 hover:text-cyan-900';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.dataset.countryIso3 = country.iso3;

        const countryName = document.createElement('span');
        countryName.className = 'min-w-0 truncate';
        countryName.textContent = country.name;

        const countryCode = document.createElement('span');
        countryCode.className = 'shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-500';
        countryCode.textContent = country.iso3;

        option.append(countryName, countryCode);
        option.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          selectCountry(country);
        });
        option.addEventListener('pointermove', () => setActiveOption(index));
        listbox.append(option);
      });
    }

    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
  };

  const handleInput = () => {
    selectedCountry = null;
    delete input.dataset.countryIso2;
    delete input.dataset.countryIso3;
    delete input.dataset.countryM49;
    renderOptions(input.value);
  };

  const handleFocus = () => {
    const query = selectedCountry ? '' : input.value;
    renderOptions(query);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (listbox.hidden) renderOptions(selectedCountry ? '' : input.value);
      setActiveOption(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (listbox.hidden) renderOptions(selectedCountry ? '' : input.value);
      setActiveOption(activeIndex <= 0 ? filteredCountries.length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === 'Enter' && !listbox.hidden && activeIndex >= 0) {
      event.preventDefault();
      const country = filteredCountries[activeIndex];
      if (country) selectCountry(country);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeListbox();
      return;
    }
    if (event.key === 'Tab') closeListbox();
  };

  const handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!input.contains(target) && !listbox.contains(target)) closeListbox();
  };

  input.addEventListener('input', handleInput);
  input.addEventListener('focus', handleFocus);
  input.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', handleDocumentPointerDown);

  const selectIso = (iso: string): boolean => {
    const normalizedIso = String(iso || '').trim().toUpperCase();
    const country = normalizedIso === 'WLD' && options.includeWorld ? WORLD_OPTION : UN_COUNTRIES_BY_ISO.get(normalizedIso);
    if (!country) return false;
    selectCountry(country, false);
    return true;
  };

  if (options.defaultIso) selectIso(options.defaultIso);
  input.setAttribute('aria-label', options.inputLabel);

  return {
    destroy: () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
    },
    getValue: () => selectedCountry?.iso3 || input.dataset.countryIso3 || input.value.trim().toUpperCase(),
    selectIso,
  };
}
