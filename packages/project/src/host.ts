export type FileStat = {
  type: "file" | "directory" | "other";
  size?: number;
};

export type DirEntry = {
  name: string;
  type: FileStat["type"];
};

export interface ProjectHost {
  rootUri(): string;
  readFile(uri: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  stat(uri: string): Promise<FileStat | undefined>;
  readDir(uri: string): Promise<readonly DirEntry[]>;
  realpath?(uri: string): Promise<string>;
  resolvePackageUri?(packageName: string): Promise<string | undefined>;
}
