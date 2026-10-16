<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

const API = 'http://localhost:3333'
const STATUSES = ['To Do', 'In Progress', 'Completed']
const PRIORITIES = ['Low', 'Medium', 'High']

//  Reactive state 
const tasks = ref([])
const newTask = ref({ title: '', description: '', dueDate: '', priority: '' })

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

// Create form (opens in a modal so the list stays the landing page)
const createModalOpen = ref(false)
const titleInput = ref(null)
const titleError = ref('')
const submitting = ref(false)

// Edit form (PATCH)
const editingId = ref(null)
const editForm = ref({ title: '', description: '', dueDate: '', priority: '', status: 'To Do' })
const editError = ref('')
const savingEdit = ref(false)

// Quick status change
const statusSavingId = ref(null)

// Safe delete flow
const taskToDelete = ref(null)
const deleting = ref(false)
const deleteError = ref('')

//  Helpers 
const toastClass = computed(() => {
  if (toast.value?.type === 'success') return 'bg-green-50 border-green-200 text-green-800'
  if (toast.value?.type === 'info') return 'bg-blue-50 border-blue-200 text-blue-800'
  return 'bg-red-50 border-red-200 text-red-800'
})

const showToast = (type, text) => {
  toast.value = { type, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 4000)
}

// The API returns camelCase (dueDate); the contract uses snake_case (due_date) — accept both
const dueDateOf = (task) => task.due_date || task.dueDate || ''
const statusOf = (task) => task.status || 'To Do'
const isCompleted = (task) => statusOf(task) === 'Completed'

const todayISO = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Overdue = due date has passed and the task is not completed
const isOverdue = (task) => {
  const due = dueDateOf(task)
  if (!due || isCompleted(task)) return false
  return due.slice(0, 10) < todayISO()
}

const statusClass = (status) =>
  ({
    'To Do': 'border-gray-200 bg-gray-100 text-gray-700',
    'In Progress': 'border-amber-200 bg-amber-100 text-amber-800',
    Completed: 'border-green-200 bg-green-100 text-green-800',
  }[status] || 'border-gray-200 bg-gray-100 text-gray-700')

const priorityBorderClass = (task) =>
  ({ High: 'border-red-500', Medium: 'border-yellow-500', Low: 'border-green-500' }[task.priority] ||
    'border-gray-300')

// Turn Vine 422 / API error payloads into a readable sentence
const readErrorMessage = async (response, fallback) => {
  try {
    const body = await response.json()
    if (Array.isArray(body?.errors) && body.errors.length) {
      return body.errors.map((error) => error.message).join(' ')
    }
    return body?.message || body?.error || fallback
  } catch {
    return fallback
  }
}

const validateTitle = (value) => {
  const title = (value || '').trim()
  if (!title) return 'Title is required.'
  if (title.length > 255) return 'Title must be 255 characters or fewer.'
  return ''
}

//  GET: fetch tasks with the active filters 
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

//  POST: create a task 
const openCreateModal = async () => {
  titleError.value = ''
  createModalOpen.value = true
  await nextTick()
  titleInput.value?.focus()
}

const closeCreateModal = () => {
  if (submitting.value) return // block closing while the request is in flight
  createModalOpen.value = false
  titleError.value = ''
}

const submitTask = async () => {
  titleError.value = validateTitle(newTask.value.title)
  if (titleError.value) return

  submitting.value = true
  try {
    const response = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTask.value.title.trim(),
        description: newTask.value.description,
        due_date: newTask.value.dueDate,
        priority: newTask.value.priority,
      }),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `server responded with ${response.status}`))
    }

    // Close the modal and refresh the board (under the current filters)
    newTask.value = { title: '', description: '', dueDate: '', priority: '' }
    titleError.value = ''
    createModalOpen.value = false
    showToast('success', 'Task created')
    await fetchTasks()
  } catch (error) {
    showToast('error', `Could not save the task: ${error.message}`)
    console.error('Error creating task:', error)
  } finally {
    submitting.value = false
  }
}

//  PATCH: update a task 
const updateTask = async (taskId, data) => {
  try {
    const response = await fetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (response.ok) return { ok: true }
    if (response.status === 404) return { ok: false, message: 'This task no longer exists.' }
    return {
      ok: false,
      message: await readErrorMessage(response, `Update failed (${response.status}).`),
    }
  } catch (error) {
    console.error('Error updating task:', error)
    return { ok: false, message: 'Could not reach the server. Is the backend running on port 3333?' }
  }
}

const changeStatus = async (task, status) => {
  statusSavingId.value = task.id
  const result = await updateTask(task.id, { status })
  statusSavingId.value = null

  if (result.ok) {
    task.status = status // instant feedback, then resync with the server
    showToast('success', `Status changed to "${status}"`)
    await fetchTasks()
  } else {
    showToast('error', result.message)
    await fetchTasks() // reset the dropdown to the saved value
  }
}

const startEdit = (task) => {
  editError.value = ''
  editingId.value = task.id
  editForm.value = {
    title: task.title,
    description: task.description || '',
    dueDate: dueDateOf(task).split('T')[0],
    priority: task.priority || '',
    status: statusOf(task),
  }
}

const cancelEdit = () => {
  editingId.value = null
  editError.value = ''
}

const saveEdit = async () => {
  editError.value = validateTitle(editForm.value.title)
  if (editError.value) return

  savingEdit.value = true
  try {
    const result = await updateTask(editingId.value, {
      title: editForm.value.title.trim(),
      description: editForm.value.description.trim() || null,
      due_date: editForm.value.dueDate || null,
      priority: editForm.value.priority || null,
      status: editForm.value.status,
    })

    if (!result.ok) {
      if (result.message === 'This task no longer exists.') {
        showToast('info', 'That task no longer exists. List refreshed.')
        cancelEdit()
        await fetchTasks()
        return
      }
      editError.value = result.message
      return
    }

    cancelEdit()
    showToast('success', 'Task updated')
    await fetchTasks()
  } finally {
    savingEdit.value = false
  }
}

//  DELETE: safe delete 
const requestDelete = (task) => {
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
      tasks.value = tasks.value.filter((item) => item.id !== task.id)
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

    deleteError.value = await readErrorMessage(response, `Deletion failed (${response.status}).`)
  } catch (error) {
    // Keep the modal open so the user can retry or cancel
    deleteError.value = `Could not delete this task: ${error.message}`
    console.error('Error deleting task:', error)
  } finally {
    deleting.value = false
  }
}

//  Keyboard shortcuts 
const onKeydown = (event) => {
  if (event.key !== 'Escape') return
  if (createModalOpen.value) closeCreateModal()
  else if (taskToDelete.value) closeDeleteModal()
  else if (editingId.value !== null) cancelEdit()
}

// Lock background scroll while a modal is open
watch([createModalOpen, taskToDelete], ([createOpen, pendingDelete]) => {
  document.body.style.overflow = createOpen || pendingDelete ? 'hidden' : ''
})

onMounted(() => {
  fetchTasks()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-4 font-sans sm:p-8">
    <div class="max-w-3xl mx-auto">
      <!-- Header + primary action -->
      <div class="mb-8 flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Team To-Do List</h1>
          <p class="text-gray-500 mt-2">Manage and track your project tasks.</p>
        </div>
        <button
          type="button"
          @click="openCreateModal"
          class="inline-flex items-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:self-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          New Task
        </button>
      </div>

      <!-- Feedback toast -->
      <div
        v-if="toast"
        :class="toastClass"
        class="mb-4 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        role="status"
        aria-live="polite"
      >
        <span>{{ toast.text }}</span>
        <button type="button" @click="toast = null" class="font-bold opacity-60 hover:opacity-100" aria-label="Dismiss">&times;</button>
      </div>

      <!-- Load failure -->
      <div v-if="fetchError" class="mb-4 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <span>{{ fetchError }}</span>
        <button type="button" @click="fetchTasks" class="font-medium underline hover:text-red-900">Retry</button>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div class="flex-1">
          <label for="filter-status" class="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select id="filter-status" v-model="filters.status" class="block w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="">All statuses</option>
            <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
          </select>
        </div>

        <div class="flex-1">
          <label for="filter-priority" class="mb-1 block text-xs font-medium text-gray-500">Priority</label>
          <select id="filter-priority" v-model="filters.priority" class="block w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="">All priorities</option>
            <option v-for="priority in PRIORITIES" :key="priority" :value="priority">{{ priority }}</option>
          </select>
        </div>

        <label class="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-gray-700">
          <input v-model="filters.overdue" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          Overdue only
        </label>

        <div class="flex items-center gap-3 pb-0.5">
          <span class="text-sm text-gray-500">{{ tasks.length }} {{ tasks.length === 1 ? 'task' : 'tasks' }}</span>
          <button v-if="hasActiveFilters" type="button" @click="clearFilters" class="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
            Clear filters
          </button>
        </div>
      </div>

      <!-- Loading: skeleton on first load, subtle note on refresh -->
      <div v-if="loading && tasks.length === 0" class="space-y-4" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="h-24 animate-pulse rounded-xl border border-gray-100 bg-white"></div>
      </div>
      <div v-else-if="loading" class="mb-3 py-2 text-center text-xs text-gray-400">Refreshing…</div>

      <!-- Task List Display -->
      <div class="space-y-4">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="bg-white p-5 rounded-xl shadow-sm border-l-4"
          :class="priorityBorderClass(task)"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <!-- Left Side: Task Data -->
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-bold" :class="isCompleted(task) ? 'text-gray-400 line-through' : 'text-gray-900'">
                  {{ task.title }}
                </h3>
                <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusClass(statusOf(task))">
                  {{ statusOf(task) }}
                </span>
                <span v-if="isOverdue(task)" class="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Overdue
                </span>
              </div>

              <p
                v-if="task.description"
                class="mt-1 text-sm"
                :class="isCompleted(task) ? 'text-gray-400' : 'text-gray-600'"
              >
                {{ task.description }}
              </p>

              <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
                <span v-if="task.priority">
                  Priority: <strong class="text-gray-900">{{ task.priority }}</strong>
                </span>
                <span v-if="dueDateOf(task)">
                  Due:
                  <strong :class="isOverdue(task) ? 'text-red-600' : 'text-gray-900'">
                    {{ dueDateOf(task).split('T')[0] }}
                  </strong>
                </span>
              </div>
            </div>

            <!-- Right Side: Actions -->
            <div v-if="editingId !== task.id" class="flex shrink-0 flex-wrap items-center gap-2">
              <label class="sr-only" :for="'status-' + task.id">Status for {{ task.title }}</label>
              <select
                :id="'status-' + task.id"
                :value="task.status"
                :disabled="statusSavingId === task.id"
                @change="changeStatus(task, $event.target.value)"
                class="rounded-lg border border-gray-300 p-1.5 text-xs focus:border-blue-500 focus:ring-blue-500 disabled:cursor-wait disabled:opacity-60"
              >
                <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
              </select>

              <button
                type="button"
                @click="startEdit(task)"
                class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit
              </button>

              <button
                type="button"
                @click="requestDelete(task)"
                :disabled="deleting"
                title="Delete task"
                class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                Delete
              </button>
            </div>
          </div>

          <!-- Edit panel (full width, replaces the action row) -->
          <div v-if="editingId === task.id" class="mt-4 border-t border-gray-100 pt-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1" :for="'edit-title-' + task.id">Title *</label>
                <input
                  :id="'edit-title-' + task.id"
                  v-model="editForm.title"
                  type="text"
                  :disabled="savingEdit"
                  @input="editError = ''"
                  class="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
                  placeholder="Task title"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1" :for="'edit-desc-' + task.id">Description</label>
                <textarea
                  :id="'edit-desc-' + task.id"
                  v-model="editForm.description"
                  rows="2"
                  :disabled="savingEdit"
                  class="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
                  placeholder="Optional details..."
                ></textarea>
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1" :for="'edit-due-' + task.id">Due Date</label>
                <input
                  :id="'edit-due-' + task.id"
                  v-model="editForm.dueDate"
                  type="date"
                  :disabled="savingEdit"
                  class="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1" :for="'edit-priority-' + task.id">Priority</label>
                <select
                  :id="'edit-priority-' + task.id"
                  v-model="editForm.priority"
                  :disabled="savingEdit"
                  class="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="">No priority</option>
                  <option v-for="priority in PRIORITIES" :key="priority" :value="priority">{{ priority }}</option>
                </select>
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1" :for="'edit-status-' + task.id">Status</label>
                <select
                  :id="'edit-status-' + task.id"
                  v-model="editForm.status"
                  :disabled="savingEdit"
                  class="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
                </select>
              </div>
            </div>

            <p v-if="editError" class="mt-3 text-sm text-red-600" role="alert">{{ editError }}</p>

            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                @click="cancelEdit"
                :disabled="savingEdit"
                class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="saveEdit"
                :disabled="savingEdit"
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ savingEdit ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="!loading && !fetchError && tasks.length === 0" class="text-center py-10 bg-white rounded-xl border border-gray-200 border-dashed">
          <p v-if="hasActiveFilters" class="text-gray-500">No tasks match your filters.</p>
          <p v-else class="text-gray-500">No tasks yet. Create your first one to get started.</p>
          <div class="mt-3 flex justify-center gap-4">
            <button v-if="hasActiveFilters" type="button" @click="clearFilters" class="text-sm font-medium text-blue-600 hover:underline">
              Clear filters
            </button>
            <button v-else type="button" @click="openCreateModal" class="text-sm font-medium text-blue-600 hover:underline">
              Add a task
            </button>
          </div>
        </div>
      </div>

      <!-- Create task modal -->
      <div
        v-if="createModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="closeCreateModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
      >
        <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
          <div class="flex items-start justify-between gap-4">
            <h2 id="create-task-title" class="text-lg font-semibold text-gray-900">Add a New Task</h2>
            <button
              type="button"
              @click="closeCreateModal"
              :disabled="submitting"
              class="font-bold leading-none text-gray-400 hover:text-gray-600 disabled:opacity-50"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <form novalidate @submit.prevent="submitTask" class="mt-4 space-y-4">
            <div>
              <label for="new-title" class="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
              <input
                id="new-title"
                ref="titleInput"
                v-model="newTask.title"
                type="text"
                :disabled="submitting"
                @input="titleError = ''"
                aria-describedby="new-title-error"
                :aria-invalid="Boolean(titleError)"
                class="block w-full border rounded-lg p-2.5 focus:ring-1 disabled:opacity-60"
                :class="titleError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'"
                placeholder="What needs to be done?"
              />
              <p v-if="titleError" id="new-title-error" class="mt-1 text-xs text-red-600" role="alert">
                {{ titleError }}
              </p>
            </div>

            <div>
              <label for="new-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="new-description"
                v-model="newTask.description"
                rows="2"
                :disabled="submitting"
                class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
                placeholder="Optional details..."
              ></textarea>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="new-due" class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  id="new-due"
                  v-model="newTask.dueDate"
                  type="date"
                  :disabled="submitting"
                  class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label for="new-priority" class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  id="new-priority"
                  v-model="newTask.priority"
                  :disabled="submitting"
                  class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">No priority</option>
                  <option v-for="priority in PRIORITIES" :key="priority" :value="priority">{{ priority }}</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button
                type="button"
                @click="closeCreateModal"
                :disabled="submitting"
                class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="submitting"
                class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ submitting ? 'Saving…' : 'Save Task' }}
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

          <p v-if="deleteError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
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
  </div>
</template>
