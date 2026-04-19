import { useEffect, useMemo, useState } from 'react';
import type { CustomizationModal } from '../types';
import { useCustomizationFileActionState } from './useCustomizationFileActionState';
import { useCustomizationFileEditorState } from './useCustomizationFileEditorState';
import { useCustomizationFileSearchState } from './useCustomizationFileSearchState';
import { useCustomizationFileTreeState } from './useCustomizationFileTreeState';

type UseCustomizationFilesStateParams = {
  normalizedWorkspaceRootPath: string;
  setActiveModal: React.Dispatch<React.SetStateAction<CustomizationModal>>;
};

export function useCustomizationFilesState({
  normalizedWorkspaceRootPath,
  setActiveModal,
}: UseCustomizationFilesStateParams) {
  const [filesError, setFilesError] = useState<string | null>(null);
  const {
    expandedDirectories,
    filesEntries,
    filesEntriesByPath,
    filesErrorByPath,
    filesLoading,
    filesLoadingByPath,
    filesParentPath,
    filesPath,
    handleToggleDirectory,
    loadFilesDirectory,
    refreshFocusedFiles,
    resetFileTreeState,
    setExpandedDirectories,
    setFilesPath,
  } = useCustomizationFileTreeState({
    normalizedWorkspaceRootPath,
    setFilesError,
  });
  const {
    filesSearchLoading,
    filesSearchQuery,
    filesSearchResults,
    resetFileSearchState,
    searchFiles,
    setFilesSearchQuery,
    setFilesSearchResults,
  } = useCustomizationFileSearchState({
    normalizedWorkspaceRootPath,
    setFilesError,
  });
  const {
    fileContent,
    fileDirty,
    fileLoading,
    fileNavHistoryRef,
    fileNavIndexRef,
    fileNavState,
    filePreviewBlock,
    fileSaving,
    fileStatus,
    handleSaveFile,
    loadFile,
    openFileModal,
    selectedFileLine,
    selectedFileName,
    selectedFileNavigationKey,
    selectedFilePath,
    setFileContent,
    setFileDirty,
    setFileNavState,
    setFileStatus,
    setSelectedFileName,
    setSelectedFilePath,
  } = useCustomizationFileEditorState({
    filesPath,
    loadFilesDirectory,
    setActiveModal,
  });
  const {
    fileActionDialog,
    fileActionMenuPath,
    filePathCopyState,
    handleConfirmFileAction,
    handleCopyFilePath,
    setFileActionDialog,
    setFileActionMenuPath,
  } = useCustomizationFileActionState({
    filesPath,
    normalizedWorkspaceRootPath,
    openFileModal,
    refreshFocusedFiles,
    selectedFilePath,
    setActiveModal,
    setExpandedDirectories,
    setFilesError,
    setFilesPath,
    setSelectedFileName,
    setSelectedFilePath,
  });

  useEffect(() => {
    resetFileTreeState();
    resetFileSearchState();
  }, [normalizedWorkspaceRootPath, resetFileSearchState, resetFileTreeState]);

  const visibleFiles = useMemo(
    () => filesSearchResults ?? (filesEntriesByPath[filesPath] ?? filesEntries),
    [filesEntries, filesEntriesByPath, filesPath, filesSearchResults],
  );

  return {
    expandedDirectories,
    fileActionDialog,
    fileActionMenuPath,
    fileContent,
    fileDirty,
    fileLoading,
    fileNavHistoryRef,
    fileNavIndexRef,
    fileNavState,
    filePathCopyState,
    filePreviewBlock,
    fileSaving,
    fileStatus,
    filesEntries,
    filesEntriesByPath,
    filesError,
    filesErrorByPath,
    filesLoading,
    filesLoadingByPath,
    filesParentPath,
    filesPath,
    filesSearchLoading,
    filesSearchQuery,
    filesSearchResults,
    handleConfirmFileAction,
    handleCopyFilePath,
    handleSaveFile,
    handleToggleDirectory,
    loadFile,
    loadFilesDirectory,
    openFileModal,
    refreshFocusedFiles,
    searchFiles,
    selectedFileLine,
    selectedFileName,
    selectedFileNavigationKey,
    selectedFilePath,
    setExpandedDirectories,
    setFileActionDialog,
    setFileActionMenuPath,
    setFileContent,
    setFileDirty,
    setFileNavState,
    setFileStatus,
    setFilesError,
    setFilesPath,
    setFilesSearchQuery,
    setFilesSearchResults,
    setSelectedFileName,
    setSelectedFilePath,
    visibleFiles,
  };
}
