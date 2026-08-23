import { api } from './api';

export const searchService = {
  search: async (q: string) => {
    const res = await api.get(`/search?q=${encodeURIComponent(q)}`);
    return res.data;
  },

  getSavedSearches: async () => {
    const res = await api.get('/search/saved');
    return res.data;
  },

  createSavedSearch: async (data: { name: string; query: string; filters?: any }) => {
    const res = await api.post('/search/saved', data);
    return res.data;
  },

  deleteSavedSearch: async (id: string) => {
    const res = await api.delete(`/search/saved/${id}`);
    return res.data;
  }
};
