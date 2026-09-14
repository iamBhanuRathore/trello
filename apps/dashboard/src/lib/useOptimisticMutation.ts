import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from './api';

/** Rollback context: restores snapshotted query data. */
export interface RollbackContext {
  previousData: Array<{ key: QueryKey; data: unknown }>;
  restore: () => void;
}

interface OptimisticOptions<TData, TVariables> {
  /** Query keys to cancel + snapshot before the optimistic update. */
  queryKeys: QueryKey[];
  /** Apply the local optimistic update (query cache and/or component state). */
  applyOptimistic?: (variables: TVariables) => void;
  /** Extra work on success (e.g. swap temp ids). Runs before invalidate. */
  onSuccessExtra?: (data: TData, variables: TVariables) => void;
  /** Extra work on error after rollback (e.g. reset a form flag). */
  onErrorExtra?: (variables: TVariables) => void;
  /** Query keys to invalidate after settle. Defaults to `queryKeys`. */
  invalidateKeys?: QueryKey[];
  /** Failure message for the error toast. */
  errorMessage?: string;
}

/**
 * Standard optimistic mutation: cancel + snapshot → apply → rollback +
 * `toast.error` on failure → invalidate on settle. Keeps every board
 * mutation on one pattern instead of hand-rolled try/catch per call.
 */
export function useOptimisticMutation<TData = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: OptimisticOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const { queryKeys, applyOptimistic, onSuccessExtra, onErrorExtra, invalidateKeys, errorMessage } =
    options;

  return useMutation<TData, unknown, TVariables, RollbackContext>({
    mutationFn,
    onMutate: async (variables) => {
      await Promise.all(queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const previousData = queryKeys.map((key) => ({
        key,
        data: queryClient.getQueryData(key),
      }));
      applyOptimistic?.(variables);
      return {
        previousData,
        restore: () => {
          for (const { key, data } of previousData) {
            queryClient.setQueryData(key, data);
          }
        },
      };
    },
    onSuccess: (data, variables) => {
      onSuccessExtra?.(data, variables);
    },
    onError: (err, variables, context) => {
      context?.restore();
      onErrorExtra?.(variables);
      toast.error(
        getApiErrorMessage(err, errorMessage ?? 'Something went wrong. Please try again.')
      );
    },
    onSettled: () => {
      for (const key of invalidateKeys ?? queryKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
