<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

const API = 'http://localhost:3333'

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------
const tasks = ref([])
const newTask = ref({
  title: '',
  description: '',
  dueDate: '',
  priority: '' // Defaults to empty (optional)
})

// Server-side filters (sent as ?status=&priority=&overdue=)
const filters = ref({ status: '', priority: '', overdue: false })
const hasActiveFilters = computed(() =>
  Boolean(filters.value.status || filters.value.priority || filters.value.overdue)
)

// List feedback
const loading = ref(false)
const fetchError = ref('')
const toast = ref(null) // { type: 'success' | 'info' | 'error', text }
let toastTimer = null

// Which list the card is showing: open tasks, or the "Completed tasks" history
const activeTab = ref('active') // 'active' | 'completed'

// "Add task" modal
const showAddModal = ref(false)
const saving = ref(false)
const addTitleError = ref('')
const addDateError = ref('')
const newTitleInput = ref(null)

// Safe delete flow
const taskToDelete = ref(null)
const deleting = ref(false)
const deleteError = ref('')

// Edit task modal (PATCH)
const statuses = ['To Do', 'In Progress', 'Completed']
const editingId = ref(null)
const editForm = ref({
  title: '',
  description: '',
  dueDate: '',
  priority: ''
})
const editOriginalDue = ref('') // due date when the edit started (see isPastDate rule)
const editError = ref('') // inline validation message inside the edit modal
const savingEdit = ref(false) // true while the PATCH request is in flight
const editTitleInput = ref(null) // template ref, focused when the modal opens

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const toastClass = computed(() => {
  if (toast.value?.type === 'success') return 'bg-green-50 border-green-200 text-green-800'
  if (toast.value?.type === 'info') return 'bg-violet-50 border-violet-200 text-violet-800'
  return 'bg-red-50 border-red-200 text-red-800'
})

const showToast = (type, text) => {
  toast.value = { type, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 4000)
}

// The API may return snake_case (due_date) or camelCase (dueDate), and the
// value may be a full ISO timestamp. Normalize to "YYYY-MM-DD".
const getDueDate = (task) => (task.due_date || task.dueDate || '').split('T')[0]

// Today's date as "YYYY-MM-DD" in the user's local time zone, so it can be
// compared directly (as a string) with the due date.
const todayString = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// A task is overdue when its due date has passed and it isn't completed yet.
const isOverdue = (task) => {
  const due = getDueDate(task)
  return Boolean(due) && task.status !== 'Completed' && due < todayString()
}

// Past = before today (today is allowed)
const isPastDate = (dateString) => Boolean(dateString) && dateString < todayString()

// Earliest date the edit picker allows: today, or the task's own date if it's already overdue
const editMinDate = computed(() =>
  isPastDate(editOriginalDue.value) ? editOriginalDue.value : todayString()
)

// Completed tasks are read-only history: no edits, status changes or deletes
const isLocked = (task) => task.status === 'Completed'

// "2026-10-20" -> "Oct 20, 2026" (built from parts to avoid time zone shifts)
const formatDate = (dateString) => {
  if (!dateString) return ''
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const priorityBorder = (priority) => {
  if (priority === 'High') return 'border-red-500'
  if (priority === 'Medium') return 'border-yellow-500'
  if (priority === 'Low') return 'border-green-500'
  return 'border-violet-200'
}

const priorityPill = (priority) => {
  if (priority === 'High') return 'bg-red-50 text-red-700 ring-red-200'
  if (priority === 'Medium') return 'bg-yellow-50 text-yellow-700 ring-yellow-200'
  return 'bg-green-50 text-green-700 ring-green-200'
}

const statusBadge = (status) => {
  if (status === 'In Progress') return 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  if (status === 'Completed') return 'bg-green-50 text-green-700 ring-green-200'
  return 'bg-violet-50 text-violet-700 ring-violet-200'
}

// ---------------------------------------------------------------------------
// Sorting (done in the browser, on top of the server filters)
// ---------------------------------------------------------------------------

// Soonest due date first, no date last, ties by title
const compareByDueDate = (a, b) => {
  const dueA = getDueDate(a)
  const dueB = getDueDate(b)
  if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1
  if (dueA && !dueB) return -1
  if (!dueA && dueB) return 1
  return (a.title || '').localeCompare(b.title || '')
}

// Open tasks (To Do + In Progress) by due date
const activeTasks = computed(() =>
  tasks.value.filter((t) => t.status !== 'Completed').sort(compareByDueDate)
)

// Completed tasks as history: most recently updated first
const updatedAt = (task) => Date.parse(task.updated_at || task.updatedAt || '') || 0
const completedTasks = computed(() =>
  tasks.value
    .filter((t) => t.status === 'Completed')
    .sort((a, b) => updatedAt(b) - updatedAt(a) || compareByDueDate(a, b))
)

// With a filter applied, show one flat list of the matches; the tabs only exist
// when no filter is applied.
const visibleTasks = computed(() => {
  if (hasActiveFilters.value) return [...tasks.value].sort(compareByDueDate)
  return activeTab.value === 'completed' ? completedTasks.value : activeTasks.value
})

watch(hasActiveFilters, () => { activeTab.value = 'active' })

// ---------------------------------------------------------------------------
// GET: fetch tasks from AdonisJS using the active filters
// ---------------------------------------------------------------------------
const fetchTasks = async () => {
  loading.value = true
  fetchError.value = ''
  try {
    const params = new URLSearchParams()
    if (filters.value.status) params.set('status', filters.value.status)
    if (filters.value.priority) params.set('priority', filters.value.priority)
    if (filters.value.overdue) params.set('overdue', 'true')

    const query = params.toString()
    const response = await fetch(`${API}/tasks${query ? `?${query}` : ''}`)
    if (!response.ok) throw new Error(`server responded with ${response.status}`)

    tasks.value = await response.json()
  } catch (error) {
    fetchError.value = 'Could not load tasks. Is the backend running on port 3333?'
    console.error('Error fetching tasks:', error)
  } finally {
    loading.value = false
  }
}

const clearFilters = () => {
  filters.value = { status: '', priority: '', overdue: false }
}

// Re-query the API whenever any filter changes
watch(filters, fetchTasks, { deep: true })

// ---------------------------------------------------------------------------
// PATCH: update a task's status or details
// ---------------------------------------------------------------------------

// Shared PATCH helper for the status dropdown and the edit form.
// PATCH is a partial update, so only the changed fields are sent (snake_case keys).
// Returns true if the server saved the change.
const updateTask = async (taskId, updatedData) => {
  try {
    const response = await fetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    })

    // HTTP errors (404, 422) don't throw, so check response.ok
    if (!response.ok) {
      // Try to show the server's own message (e.g. a validation error). The body
      // might not be JSON, so fall back to a generic message with the status code.
      const errorBody = await response.json().catch(() => null)
      const serverMessage = Array.isArray(errorBody?.errors)
        ? errorBody.errors.map((entry) => entry.message).join(' ')
        : errorBody?.message || errorBody?.error
      showToast('error', serverMessage || `Failed to update task (${response.status}).`)
      return false
    }

    // Refetch so the list matches the database and the current filters
    await fetchTasks()
    return true
  } catch (error) {
    // Network failure (backend down)
    console.error('Error updating task:', error)
    showToast('error', 'Could not reach the server.')
    return false
  }
}

// Status dropdown: PATCH only the new status
const changeStatus = async (task, status) => {
  // Completed tasks are read-only
  if (isLocked(task)) {
    showToast('error', 'Completed tasks can’t be changed.')
    return
  }

  const ok = await updateTask(task.id, { status })
  if (ok) showToast('success', `Moved "${task.title}" to ${status}`)
  else fetchTasks() // reset the dropdown to the saved value
}

/**
 * Open the inline edit form for one task. We copy the task into editForm
 * (instead of binding the inputs to the task itself) so that Cancel can throw
 * the changes away without touching the list.
 */
const startEdit = async (task) => {
  // Completed tasks can't be edited (the Edit button is hidden for them too)
  if (isLocked(task)) {
    showToast('error', 'Completed tasks can’t be edited.')
    return
  }

  editError.value = ''
  editingId.value = task.id
  editOriginalDue.value = getDueDate(task)
  editForm.value = {
    title: task.title,
    description: task.description || '',
    dueDate: getDueDate(task), // <input type="date"> needs "YYYY-MM-DD"
    priority: task.priority || ''
  }

  // Start typing right away, same as the "Add task" modal
  await nextTick()
  editTitleInput.value?.focus()
}

const cancelEdit = () => {
  if (savingEdit.value) return // block closing while the request is in flight
  editingId.value = null
  editError.value = ''
}

/**
 * Save the edit modal. Unlike the status dropdown, this sends all the editable
 * fields in one PATCH request.
 *
 * - The API expects snake_case, so dueDate is sent as due_date.
 * - Empty date or priority is sent as null (not ""), so the database clears the
 *   value rather than storing an empty string that would fail date validation.
 * - The modal only closes when the save succeeded, so the user's changes aren't
 *   lost if the request fails.
 */
const saveEdit = async (taskId) => {
  if (savingEdit.value) return

  // Completed tasks are read-only
  const current = tasks.value.find((t) => t.id === taskId)
  if (current && isLocked(current)) {
    return showToast('error', 'Completed tasks can’t be edited.')
  }

  editError.value = ''
  if (!editForm.value.title.trim()) {
    editError.value = 'Title is required'
    return
  }

  // Block new past dates (keeping an existing overdue date is fine)
  if (isPastDate(editForm.value.dueDate) && editForm.value.dueDate !== editOriginalDue.value) {
    editError.value = 'Due date can’t be in the past. Pick today or a later date.'
    return
  }

  savingEdit.value = true
  try {
    const ok = await updateTask(taskId, {
      title: editForm.value.title.trim(),
      description: editForm.value.description,
      due_date: editForm.value.dueDate || null,
      priority: editForm.value.priority || null
    })

    if (ok) {
      cancelEdit()
      showToast('success', 'Task updated')
    }
  } finally {
    savingEdit.value = false
  }
}

// ---------------------------------------------------------------------------
// POST: send a new task to AdonisJS (from the "Add task" modal)
// ---------------------------------------------------------------------------
const resetNewTask = () => {
  newTask.value = { title: '', description: '', dueDate: '', priority: '' }
  addTitleError.value = ''
  addDateError.value = ''
}

const openAddModal = async () => {
  resetNewTask()
  showAddModal.value = true
  await nextTick()
  newTitleInput.value?.focus() // start typing right away
}

const closeAddModal = () => {
  if (saving.value) return // block closing while the request is in flight
  showAddModal.value = false
  resetNewTask()
}

const submitTask = async () => {
  if (saving.value) return
  if (!newTask.value.title.trim()) {
    addTitleError.value = 'Title is required'
    return
  }

  // Typing a date by hand can bypass the picker's min
  if (isPastDate(newTask.value.dueDate)) {
    addDateError.value = 'Due date can’t be in the past. Pick today or a later date.'
    return
  }

  saving.value = true
  addTitleError.value = ''
  addDateError.value = ''

  try {
    const response = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTask.value.title.trim(),
        description: newTask.value.description,
        due_date: newTask.value.dueDate,
        priority: newTask.value.priority
      })
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.message || `server responded with ${response.status}`)
    }

    showAddModal.value = false
    resetNewTask()
    activeTab.value = 'active'
    showToast('success', 'Task created')
    await fetchTasks()
  } catch (error) {
    // Keep the modal open so the user's input isn't lost
    addTitleError.value = `Could not save the task: ${error.message}`
    console.error('Error creating task:', error)
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------------------
// DELETE: safe delete (confirmation modal)
// ---------------------------------------------------------------------------
const requestDelete = (task) => {
  if (isLocked(task)) return // completed tasks are kept as history
  taskToDelete.value = task
  deleteError.value = ''
}

const closeDeleteModal = () => {
  if (deleting.value) return // block closing while the request is in flight
  taskToDelete.value = null
  deleteError.value = ''
}

const confirmDelete = async () => {
  const task = taskToDelete.value
  if (!task || deleting.value) return

  deleting.value = true
  deleteError.value = ''

  try {
    const response = await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE' })

    if (response.ok) {
      // Removed on the server -> drop it from the list instantly
      tasks.value = tasks.value.filter((t) => t.id !== task.id)
      taskToDelete.value = null
      showToast('success', `"${task.title}" deleted`)
      return
    }

    if (response.status === 404) {
      // Already gone -> resync with the current filters
      taskToDelete.value = null
      showToast('info', 'That task no longer exists. List refreshed.')
      await fetchTasks()
      return
    }

    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `server responded with ${response.status}`)
  } catch (error) {
    // Keep the modal open so the user can retry or cancel
    deleteError.value = `Could not delete this task: ${error.message}`
    console.error('Error deleting task:', error)
  } finally {
    deleting.value = false
  }
}

// Esc closes whichever modal is open (delete confirmation first)
const onKeydown = (event) => {
  if (event.key !== 'Escape') return
  if (taskToDelete.value) closeDeleteModal()
  else if (showAddModal.value) closeAddModal()
  else if (editingId.value !== null) cancelEdit()
}

// Load tasks when the page loads
onMounted(() => {
  fetchTasks()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(toastTimer)
})
</script>

<template>
  <!--
    The page itself never scrolls: the root is pinned to the viewport (fixed
    inset-0) and only the task list inside the card scrolls.
  -->
  <div class="fixed inset-0 overflow-hidden bg-gradient-to-br from-violet-50 via-violet-50 to-violet-100 font-sans">
    <div class="mx-auto flex h-full w-full max-w-3xl flex-col p-3 sm:p-6">
      <!-- Header -->
      <div class="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-bold text-gray-900 sm:text-3xl">Team To-Do List</h1>
          <p class="mt-1 hidden text-sm text-gray-500 sm:block">Manage and track your project tasks.</p>
        </div>
        <button
          type="button"
          @click="openAddModal"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          Add task
        </button>
      </div>

      <!-- Main card: filters + tabs on top, scrolling task list below -->
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-lg shadow-violet-200/40">
        <!-- Card header: filters and tabs (never scroll away) -->
        <div class="shrink-0 space-y-3 border-b border-violet-100 bg-violet-50/50 p-3 sm:p-4">
          <!-- Filters -->
          <div class="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3">
            <div class="sm:flex-1">
              <label for="filter-status" class="mb-1 block text-xs font-medium text-gray-500">Status</label>
              <select id="filter-status" v-model="filters.status" class="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-violet-500 focus:ring-violet-500">
                <option value="">All statuses</option>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div class="sm:flex-1">
              <label for="filter-priority" class="mb-1 block text-xs font-medium text-gray-500">Priority</label>
              <select id="filter-priority" v-model="filters.priority" class="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-violet-500 focus:ring-violet-500">
                <option value="">All priorities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div class="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-start sm:pb-2">
              <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input v-model="filters.overdue" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                Overdue only
              </label>
              <button v-if="hasActiveFilters" type="button" @click="clearFilters" class="whitespace-nowrap text-sm font-medium text-violet-600 hover:text-violet-700 hover:underline">
                Clear filters
              </button>
            </div>
          </div>

          <!-- Tabs: only when no filter is applied -->
          <div v-if="!hasActiveFilters" class="flex gap-1 rounded-lg bg-violet-100/70 p-1" role="tablist" aria-label="Task lists">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'active'"
              @click="activeTab = 'active'"
              class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              :class="activeTab === 'active' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-violet-700'"
            >
              Tasks <span class="ml-1 text-xs font-semibold opacity-70">{{ activeTasks.length }}</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'completed'"
              @click="activeTab = 'completed'"
              class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              :class="activeTab === 'completed' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-violet-700'"
            >
              Completed Tasks <span class="ml-1 text-xs font-semibold opacity-70">{{ completedTasks.length }}</span>
            </button>
          </div>
        </div>

        <!-- Scrolling task list: the only part of the page that scrolls -->
        <div
          class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-color:#c4b5fd_transparent] [scrollbar-width:thin] sm:p-4"
          role="tabpanel"
        >
          <!-- Load failure -->
          <div v-if="fetchError" class="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            <span>{{ fetchError }}</span>
            <button type="button" @click="fetchTasks" class="font-medium underline hover:text-red-900">Retry</button>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center gap-2 py-3 text-sm text-gray-500" role="status">
            <svg class="h-4 w-4 animate-spin text-violet-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            Loading tasks&hellip;
          </div>

          <!-- Task cards -->
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            class="rounded-xl border-l-4 bg-white p-4 shadow-sm ring-1 ring-violet-100 transition-shadow hover:shadow-md"
            :class="[priorityBorder(task.priority), task.status === 'Completed' ? 'opacity-75' : '']"
          >
            <!-- Task data (the edit form now lives in a modal) -->
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <!-- Left side: task data -->
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3
                    class="break-words text-lg font-bold"
                    :class="task.status === 'Completed' ? 'text-gray-500 line-through' : 'text-gray-900'"
                  >
                    {{ task.title }}
                  </h3>
                  <span
                    v-if="isOverdue(task)"
                    class="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200"
                  >
                    Overdue
                  </span>
                </div>

                <p v-if="task.description" class="mt-1 break-words text-sm text-gray-600">{{ task.description }}</p>

                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-1 ring-1 ring-inset"
                    :class="statusBadge(task.status)"
                  >
                    {{ task.status }}
                  </span>

                  <span
                    v-if="task.priority"
                    class="inline-flex items-center rounded-full px-2.5 py-1 ring-1 ring-inset"
                    :class="priorityPill(task.priority)"
                  >
                    {{ task.priority }} priority
                  </span>

                  <span
                    v-if="getDueDate(task)"
                    class="inline-flex items-center gap-1"
                    :class="isOverdue(task) ? 'text-red-600' : 'text-gray-600'"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
                    </svg>
                    Due {{ formatDate(getDueDate(task)) }}
                  </span>
                </div>
              </div>

              <!-- Actions (completed tasks are read-only history, so none) -->
              <div v-if="!isLocked(task)" class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <select
                  :value="task.status"
                  @change="changeStatus(task, $event.target.value)"
                  :aria-label="`Change status of ${task.title}`"
                  class="rounded-lg border border-gray-300 p-1.5 text-xs focus:border-violet-500 focus:ring-violet-500"
                >
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>

                <button
                  type="button"
                  @click="startEdit(task)"
                  class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Edit
                </button>

                <button
                  type="button"
                  @click="requestDelete(task)"
                  :disabled="deleting"
                  title="Delete task"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>

          </div>

          <!-- Empty states -->
          <div
            v-if="!loading && !fetchError && visibleTasks.length === 0"
            class="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-10 text-center"
          >
            <p v-if="hasActiveFilters" class="text-gray-500">No tasks match your filters.</p>
            <p v-else-if="activeTab === 'completed'" class="text-gray-500">
              No completed tasks yet. Tasks you finish will show up here.
            </p>
            <p v-else class="text-gray-500">No open tasks. Add one to get started.</p>

            <button v-if="hasActiveFilters" type="button" @click="clearFilters" class="mt-3 text-sm font-medium text-violet-600 hover:underline">
              Clear filters
            </button>
            <button
              v-else-if="activeTab === 'active'"
              type="button"
              @click="openAddModal"
              class="mt-3 text-sm font-medium text-violet-600 hover:underline"
            >
              Add task
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Feedback toast: floats over the page so it never pushes the layout -->
    <div
      v-if="toast"
      :class="toastClass"
      class="fixed left-1/2 top-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm shadow-lg"
      role="status"
    >
      <span>{{ toast.text }}</span>
      <button type="button" @click="toast = null" class="font-bold opacity-60 hover:opacity-100" aria-label="Dismiss">&times;</button>
    </div>

    <!-- Add task modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
      @click.self="closeAddModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <h2 id="add-task-title" class="text-lg font-semibold text-gray-900">Add a new task</h2>

        <form @submit.prevent="submitTask" class="mt-4 space-y-4">
          <div>
            <label for="new-title" class="mb-1 block text-sm font-medium text-gray-700">
              Task title <span class="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="new-title"
              ref="newTitleInput"
              v-model="newTask.title"
              type="text"
              @input="addTitleError = ''"
              aria-describedby="new-title-error"
              :aria-invalid="Boolean(addTitleError)"
              class="block w-full rounded-lg border transition-colors p-2.5 focus:ring-1"
              :class="addTitleError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-violet-500 focus:ring-violet-500'"
              placeholder="What needs to be done?"
            />
            <p v-if="addTitleError" id="new-title-error" class="mt-1 text-xs text-red-600" role="alert">
              {{ addTitleError }}
            </p>
          </div>

          <div>
            <label for="new-description" class="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              id="new-description"
              v-model="newTask.description"
              rows="2"
              class="block w-full rounded-lg border border-gray-300 p-2.5 transition-colors focus:border-violet-500 focus:ring-violet-500"
              placeholder="Optional details..."
            ></textarea>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="new-due" class="mb-1 block text-sm font-medium text-gray-700">Due date</label>
              <input
                id="new-due"
                v-model="newTask.dueDate"
                type="date"
                :min="todayString()"
                @input="addDateError = ''"
                aria-describedby="new-due-error"
                class="block w-full rounded-lg border transition-colors p-2.5 focus:ring-1"
                :class="addDateError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-violet-500 focus:ring-violet-500'"
              />
              <p v-if="addDateError" id="new-due-error" class="mt-1 text-xs text-red-600" role="alert">
                {{ addDateError }}
              </p>
            </div>
            <div>
              <label for="new-priority" class="mb-1 block text-sm font-medium text-gray-700">Priority</label>
              <select
                id="new-priority"
                v-model="newTask.priority"
                class="block w-full rounded-lg border border-gray-300 p-2.5 transition-colors focus:border-violet-500 focus:ring-violet-500"
              >
                <option value="">No priority</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-1">
            <button
              type="button"
              @click="closeAddModal"
              :disabled="saving"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-violet-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="saving"
              class="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ saving ? 'Saving…' : 'Save task' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit task modal -->
    <div
      v-if="editingId !== null"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
      @click.self="cancelEdit"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-task-title"
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <h2 id="edit-task-title" class="text-lg font-semibold text-gray-900">Edit task</h2>

        <form @submit.prevent="saveEdit(editingId)" class="mt-4 space-y-4">
          <div>
            <label for="edit-title" class="mb-1 block text-sm font-medium text-gray-700">
              Task title <span class="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="edit-title"
              ref="editTitleInput"
              v-model="editForm.title"
              type="text"
              :disabled="savingEdit"
              @input="editError = ''"
              aria-describedby="edit-error"
              :aria-invalid="Boolean(editError)"
              class="block w-full rounded-lg border transition-colors p-2.5 focus:ring-1 disabled:opacity-60"
              :class="editError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-violet-500 focus:ring-violet-500'"
              placeholder="What needs to be done?"
            />
            <p v-if="editError" id="edit-error" class="mt-1 text-xs text-red-600" role="alert">
              {{ editError }}
            </p>
          </div>

          <div>
            <label for="edit-description" class="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              id="edit-description"
              v-model="editForm.description"
              rows="2"
              :disabled="savingEdit"
              class="block w-full rounded-lg border border-gray-300 p-2.5 transition-colors focus:border-violet-500 focus:ring-violet-500 disabled:opacity-60"
              placeholder="Optional details..."
            ></textarea>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="edit-due" class="mb-1 block text-sm font-medium text-gray-700">Due date</label>
              <input
                id="edit-due"
                v-model="editForm.dueDate"
                type="date"
                :min="editMinDate"
                :disabled="savingEdit"
                class="block w-full rounded-lg border border-gray-300 p-2.5 transition-colors focus:border-violet-500 focus:ring-violet-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label for="edit-priority" class="mb-1 block text-sm font-medium text-gray-700">Priority</label>
              <select
                id="edit-priority"
                v-model="editForm.priority"
                :disabled="savingEdit"
                class="block w-full rounded-lg border border-gray-300 p-2.5 transition-colors focus:border-violet-500 focus:ring-violet-500 disabled:opacity-60"
              >
                <option value="">No priority</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-1">
            <button
              type="button"
              @click="cancelEdit"
              :disabled="savingEdit"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-violet-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="savingEdit"
              class="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ savingEdit ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="taskToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeDeleteModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
    >
      <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="delete-task-title" class="text-lg font-semibold text-gray-900">Delete task?</h2>
        <p class="mt-2 text-sm text-gray-600">
          You're about to permanently delete
          <strong class="text-gray-900">"{{ taskToDelete.title }}"</strong>.
          This action can't be undone.
        </p>

        <p v-if="deleteError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ deleteError }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            @click="closeDeleteModal"
            :disabled="deleting"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmDelete"
            :disabled="deleting"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ deleting ? 'Deleting…' : 'Delete task' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>