export function useRouter() {
  return {
    push(href: string) {
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          history.pushState(null, '', href);
          dispatchEvent(new PopStateEvent('popstate'));
          resolve();
        }, 250),
      );
    },
  };
}
