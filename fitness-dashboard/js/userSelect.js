// fitness-dashboard/js/userSelect.js
import { loadUserList } from './dataStore.js?v=msbmft4d';

/** Populates `selectEl` with usernames from workout/users.json and wires onChange(username). */
export async function setupUserSelect(selectEl, onChange) {
  const users = await loadUserList();
  selectEl.innerHTML = users.map((u) => `<option value="${u}">${u}</option>`).join('');
  selectEl.addEventListener('change', () => onChange(selectEl.value));
  if (users.length > 0) onChange(users[0]);
  return users;
}
