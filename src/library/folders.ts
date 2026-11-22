/** Sub-folders of the imported music folders, from each track's relative path ("Song MP3s/House/x.mp3"). */
export interface Folder {
  path: string;
  name: string;
  depth: number;
  /** tracks in this folder and all of its sub-folders */
  count: number;
}

export function folderTree(paths: Iterable<string>): Folder[] {
  const map = new Map<string, Folder>();
  for (const p of paths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      const f = map.get(path);
      if (f) f.count++;
      else map.set(path, { path, name: parts[i - 1], depth: i - 1, count: 1 });
    }
  }
  // "/" sorts before letters, so children come straight after their parent
  return [...map.values()].sort((a, b) => (a.path + '/').localeCompare(b.path + '/', undefined, { sensitivity: 'base' }));
}

/** Is the track at `trackPath` inside `folder` (at any depth)? */
export const inFolder = (trackPath: string, folder: string): boolean => trackPath.startsWith(`${folder}/`);
