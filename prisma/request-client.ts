/** Preserve Prisma promises/delegates while resolving bindings only inside a
 * request. Root methods such as $transaction require their original receiver. */
export function lazyRequestClient<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (property === 'then') return undefined;
      const client = resolve();
      const value = Reflect.get(client, property, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}
