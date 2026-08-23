import { api } from './api';

export interface TrashedItem {
  id: string;
  name: string;
  itemType: 'workspace' | 'project' | 'board' | 'card';
  deletedAt: string;
  daysRemaining: number;
  locationInfo?: string;
}

export const trashService = {
  getTrash: async (): Promise<TrashedItem[]> => {
    const res = await api.get('/trash');
    return res.data;
  },

  restoreItem: async (itemType: 'workspace' | 'project' | 'board' | 'card', itemId: string) => {
    const res = await api.post('/trash/restore', { itemType, itemId });
    return res.data;
  },

  deleteForever: async (itemType: 'workspace' | 'project' | 'board' | 'card', itemId: string) => {
    const res = await api.delete(`/trash/${itemType}/${itemId}`);
    return res.data;
  },

  emptyTrash: async () => {
    const res = await api.delete('/trash/empty');
    return res.data;
  },
};
