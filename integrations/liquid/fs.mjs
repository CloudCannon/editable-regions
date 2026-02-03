// @ts-nocheck
import { log, warn } from './logger.mjs';

export function createInMemoryFs(options = {}) {
  const { baseIncludesDir = 'src/_includes/' } = options;

  return {
    sep: '/',
    
    /**
     * @param {string} filePath
     */
    dirname(filePath) {
      const parts = filePath.split('/');
      parts.pop();
      return parts.join('/') || '/';
    },
    
    /**
     * @param {string | string[]} filePath
     */
    readFileSync(filePath) {
      log('readFileSync:', filePath);
      const fileContents = window.cc_files[filePath];
      
      if (fileContents === undefined) {
        const availableFiles = Object.keys(window.cc_files || {});
        warn('File not found:', filePath);
        log('Available files:', availableFiles);
      } else {
        log('File found, length:', fileContents?.length || 0);
      }
      
      return fileContents;
    },
    
    /**
     * @param {any} filePath
     */
    async readFile(filePath) {
      log('readFile:', filePath);
      if (!filePath) {
        throw new Error('readFile called with empty path');
      }
      return this.readFileSync(filePath);
    },
    
    /**
     * @param {any} filePath
     */
    async exists(filePath) {
      if (!filePath || typeof filePath !== 'string') {
        log('exists: invalid path', filePath);
        return false;
      }
      const result = this.existsSync(filePath);
      log('exists:', filePath, '=', result);
      return result;
    },
    
    /**
     * @param {string} filePath
     */
    existsSync(filePath) {
      if (!filePath || typeof filePath !== 'string') {
        return false;
      }
      const fileContents = window.cc_files[filePath];
      const exists = fileContents !== null && fileContents !== undefined;
      log('existsSync:', filePath, '=', exists);
      return exists;
    },
    
    /**
     * @param {any} root
     * @param {any} file
     * @param {any} ext
     */
    resolve(root, file, ext) {
      // If file already looks like a full path in cc_files, return as-is
      if (window.cc_files?.[file]) {
        log('resolve:', { root, file, ext }, '-> found exact match:', file);
        return file;
      }
      
      // Otherwise, construct the full path
      const extension = ext || '.liquid';
      const fileWithExt = file.endsWith(extension) ? file : `${file}${extension}`;
      
      // Normalize the base dir to have trailing slash
      const normalizedBase = baseIncludesDir.endsWith('/') 
        ? baseIncludesDir 
        : `${baseIncludesDir}/`;
      
      const fullPath = `${normalizedBase}${fileWithExt}`;
      
      log('resolve:', { root, file, ext }, '-> returning:', fullPath);
      return fullPath;
    },
    
    async statAsync() {
      return { isFile: () => true };
    },
    
    statSync() {
      return { isFile: () => true };
    },
  };
}
