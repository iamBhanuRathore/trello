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
  boardName: t.String({ minLength: 1, maxLength: 300 }),
  lists: t.Array(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 300 }),
      tasks: t.Array(
        t.Object({
          title: t.String({ minLength: 1, maxLength: 500 }),
          description: t.Optional(t.String({ maxLength: 20000 })),
          storyPoints: t.Optional(t.Number({ minimum: 0, maximum: 1000 })),
          dueDate: t.Optional(t.String({ maxLength: 64 })),
        })
      ),
    }),
    { maxItems: 500 }
  ),
});
export type ImportTasksBody = Static<typeof ImportTasksBodySchema>;
