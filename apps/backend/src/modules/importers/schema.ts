import { t, type Static } from 'elysia';

// Importer route schemas — single source for route validation (`routes.ts`),
// service inputs (`service.ts`), and frontend annotations (dashboard annotates
// Eden call payloads with the `Static` types so even older TS language servers,
// which can't expand Eden's deep conditional body types, still complete).

export const ImportTrelloBodySchema = t.Object({
  trelloData: t.Any(),
});
export type ImportTrelloBody = Static<typeof ImportTrelloBodySchema>;

export const ImportTasksBodySchema = t.Object({
  boardName: t.String(),
  lists: t.Array(
    t.Object({
      name: t.String(),
      tasks: t.Array(
        t.Object({
          title: t.String(),
          description: t.Optional(t.String()),
          storyPoints: t.Optional(t.Number()),
          dueDate: t.Optional(t.String()),
        })
      ),
    })
  ),
});
export type ImportTasksBody = Static<typeof ImportTasksBodySchema>;
