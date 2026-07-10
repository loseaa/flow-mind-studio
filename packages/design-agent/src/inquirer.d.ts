declare module "inquirer" {
  const inquirer: {
    prompt<T extends Record<string, unknown>>(questions: unknown[]): Promise<T>;
  };

  export default inquirer;
}