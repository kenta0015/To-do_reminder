import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000',
    marginBottom: 10,
  },

  inputWrap: {
    gap: 10,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    fontSize: 16,
    color: '#000',
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#fff5f5',
  },
  errorText: {
    marginTop: -6,
    fontSize: 13,
    color: '#ef4444',
  },
  addButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  content: {
    paddingBottom: 18,
  },

  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  sectionTitleFaint: {
    fontSize: 22,
    fontWeight: '700',
    color: '#777',
    marginBottom: 12,
  },

  completedHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 15,
    color: '#999',
    fontStyle: 'italic',
  },

  taskItem: {
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  taskItemHighlight: {
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  taskContent: {
    padding: 14,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
  },
  taskContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskPressArea: {
    flex: 1,
    paddingRight: 10,
  },
  inlineStarToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
  },

  taskRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskTime: {
    width: 54,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  taskTitle: {
    flex: 1,
    fontSize: 17,
    color: '#000',
    lineHeight: 22,
  },
  lateMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
  },

  leftActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  rightActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  swipeButton: {
    width: 72,
    height: 56,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeButtonText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
  },
  starButton: {
    backgroundColor: '#111',
  },
  completeButton: {
    backgroundColor: '#16a34a',
  },

  weekDayGroup: {
    marginBottom: 14,
  },
  weekDayHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
  },

  completedRow: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  completedMain: {
    padding: 12,
    backgroundColor: '#f4f4f5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
  },
  completedCheck: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16a34a',
    width: 18,
  },
  completedTitle: {
    flex: 1,
    fontSize: 16,
    color: '#444',
    textDecorationLine: 'line-through',
  },

  importantEntry: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importantEntryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400e',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  importantRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f1f1',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  importantMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importantTitle: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    lineHeight: 22,
  },
  importantControls: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnDisabled: {
    backgroundColor: '#f3f4f6',
  },

  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 160,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  toastUndo: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '800',
  },

  navToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 66,
    alignItems: 'center',
  },
  navToast: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  navToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
