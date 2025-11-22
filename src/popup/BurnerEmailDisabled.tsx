interface BurnerEmailDisabledProps {
  onOpenSettings?: () => void;
}

export function BurnerEmailDisabled({ onOpenSettings }: BurnerEmailDisabledProps) {
  return (
    <div className="p-6 text-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
        Feature turned off. Turn it on from Settings.
      </p>
      <button
        onClick={onOpenSettings}
        disabled={!onOpenSettings}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Open Settings
      </button>
    </div>
  );
}

