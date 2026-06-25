// utils/persistence.js
// Simple persistence layer using browser localStorage.
// Stores region assignments parsed from the Excel uploader.

export const loadAssignments = () => {
  try {
    const raw = localStorage.getItem('region_assignments');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load region assignments:', e);
    return {};
  }
};

export const saveAssignments = (data) => {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem('region_assignments', serialized);
  } catch (e) {
    console.error('Failed to save region assignments:', e);
  }
};
