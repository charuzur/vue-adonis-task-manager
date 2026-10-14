<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const API = 'http://localhost:3333'

// Reactive state
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

// Safe delete flow
const taskToDelete = ref(null)
const deleting = ref(false)
const deleteError = ref('')

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

// GET: fetch tasks with the active filters 
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

// POST: send new task to AdonisJS 
const submitTask = async () => {
  if (!newTask.value.title) return alert('Title is required')

  try {
    const response = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTask.value.title,
        description: newTask.value.description,
        due_date: newTask.value.dueDate,
        priority: newTask.value.priority
      })
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.message || `server responded with ${response.status}`)
    }

    // Clear form and refresh board (under the current filters)
    newTask.value = { title: '', description: '', dueDate: '', priority: '' }
    showToast('success', 'Task created')
    await fetchTasks()
  } catch (error) {
    showToast('error', `Could not save the task: ${error.message}`)
    console.error('Error creating task:', error)
  }
}

// DELETE: safe delete 
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

// Esc closes the modal
const onKeydown = (event) => {
  if (event.key === 'Escape') closeDeleteModal()
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
  <div class="min-h-screen bg-gray-50 p-8 font-sans">
    <div class="max-w-3xl mx-auto">
      <div class="border-b border-gray-200 pb-4 mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Team To-Do List</h1>
        <p class="text-gray-500 mt-2">Manage and track your project tasks.</p>
      </div>

      <!-- Create Task Form -->
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Add a New Task</h2>
        <form @submit.prevent="submitTask" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
            <input v-model="newTask.title" type="text" required class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" placeholder="What needs to be done?" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="newTask.description" rows="2" class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" placeholder="Optional details..."></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input v-model="newTask.dueDate" type="date" class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select v-model="newTask.priority" class="block w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500">
                <option value=""></option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button type="submit" class="bg-blue-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              Save Task
            </button>
          </div>
        </form>
      </div>

      <!-- Feedback toast -->
      <div
        v-if="toast"
        :class="toastClass"
        class="mb-4 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        role="status"
      >
        <span>{{ toast.text }}</span>
        <button type="button" @click="toast = null" class="font-bold opacity-60 hover:opacity-100" aria-label="Dismiss">&times;</button>
      </div>

      <!-- Load failure -->
      <div v-if="fetchError" class="mb-4 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <span>{{ fetchError }}</span>
        <button type="button" @click="fetchTasks" class="font-medium underline hover:text-red-900">Retry</button>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div class="flex-1">
          <label for="filter-status" class="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select id="filter-status" v-model="filters.status" class="block w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="">All statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
        </div>

        <div class="flex-1">
          <label for="filter-priority" class="mb-1 block text-xs font-medium text-gray-500">Priority</label>
          <select id="filter-priority" v-model="filters.priority" class="block w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="">All priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
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

      <!-- Loading -->
      <div v-if="loading" class="mb-4 py-4 text-center text-sm text-gray-500">Loading tasks&hellip;</div>

      <!-- Task List Display -->
      <div class="space-y-4">
        <div v-for="task in tasks" :key="task.id" 
             class="bg-white p-5 rounded-xl shadow-sm border-l-4 flex flex-col sm:flex-row sm:justify-between sm:items-start" 
             :class="task.priority === 'High' ? 'border-red-500' : task.priority === 'Medium' ? 'border-yellow-500' : task.priority === 'Low' ? 'border-green-500' : 'border-gray-300'">
          
          <!-- Left Side: Task Data -->
          <div class="flex-1">
            <h3 class="font-bold text-lg text-gray-900">{{ task.title }}</h3>
            <p class="text-gray-600 text-sm mt-1" v-if="task.description">{{ task.description }}</p>
            
            <div class="mt-4 flex flex-wrap gap-4 text-xs font-medium text-gray-600">
              <span>Status: <strong class="text-gray-900">{{ task.status }}</strong></span>
              
              <span v-if="task.priority">Priority: <strong class="text-gray-900">{{ task.priority }}</strong></span>
              
              <span v-if="task.due_date || task.dueDate">
                Due: <strong class="text-gray-900">{{ (task.due_date || task.dueDate).split('T')[0] }}</strong>
              </span>
            </div>
          </div>

          <!-- Right Side: Action Area for Teammates -->
          <div class="mt-4 sm:mt-0 sm:ml-4 flex gap-2">
            <!-- Teammate 1 will add Edit/Status dropdown here -->

            <!-- Safe delete -->
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

        <!-- Empty State -->
        <div v-if="!loading && !fetchError && tasks.length === 0" class="text-center py-10 bg-white rounded-xl border border-gray-200 border-dashed">
          <p v-if="hasActiveFilters" class="text-gray-500">No tasks match your filters.</p>
          <p v-else class="text-gray-500">No tasks found. Create one above to get started.</p>
          <button v-if="hasActiveFilters" type="button" @click="clearFilters" class="mt-3 text-sm font-medium text-blue-600 hover:underline">
            Clear filters
          </button>
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
  </div>
</template>