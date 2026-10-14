<script setup>
import { ref, onMounted } from 'vue'

// Reactive state
const tasks = ref([])
const newTask = ref({
  title: '',
  description: '',
  dueDate: '',
  priority: '' // Defaults to empty (optional)
})

const statuses = ['To Do', 'In Progress', 'Completed']
const editingId = ref(null)
const editForm = ref({ 
  title: '',
  description: '', 
  dueDate: '', 
  priority: '' 
})


// GET: Fetch tasks from AdonisJS
const fetchTasks = async () => {
  try {
    const response = await fetch('http://localhost:3333/tasks')
    tasks.value = await response.json()
  } catch (error) {
    console.error('Error fetching tasks:', error)
  }
}

// PATCH: Update task status or details

const updateTask = async (taskId, updatedData) => {
  try {
    const response = await fetch(`http://localhost:3333/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    })

    if (!response.ok) {
      alert('Failed to update task. Please try again.')
      return false
    }

    await fetchTasks() // Refresh tasks after update
    return true
  } catch (error) {
    console.error('Error updating task:', error)
    alert('Could not reach the server.')
    return false
  }
}

const changeStatus = async (task, status) => {
  const ok = await updateTask(task.id, { status })
  if (!ok) fetchTasks() // reset the dropdown to the saved value
}

const startEdit = (task) => {
  editingId.value = task.id
  editForm.value = {
    title: task.title,
    description: task.description || '',
    dueDate: (task.due_date || task.dueDate || '').split('T')[0],
    priority: task.priority || ''
  }
}

const cancelEdit = () => {
  editingId.value = null
}

const saveEdit = async (taskId) => {
  if (!editForm.value.title.trim()) return alert('Title is required')

  const ok = await updateTask(taskId, {
    title: editForm.value.title,
    description: editForm.value.description,
    due_date: editForm.value.dueDate || null,
    priority: editForm.value.priority || null
  })

  if (ok) cancelEdit()
}

// POST: Send new task to AdonisJS
const submitTask = async () => {
  if (!newTask.value.title) return alert('Title is required')

  try {
    const response = await fetch('http://localhost:3333/tasks', {
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
      const errorBody = await response.text()
      console.error('PATCH failed:', response.status, errorBody)
      alert(`Failed to update task (${response.status}). Check the console.`)
      return false
    }
  } catch (error) {
    console.error('Error creating task:', error)
  }
}



// Load tasks when the page loads
onMounted(fetchTasks)
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
            <!-- Edit/Status (PATCH) -->
            <div v-if="editingId !== task.id" class="flex gap-2 items-start">
              <select
                :value="task.status"
                @change="changeStatus(task, $event.target.value)"
                class="border border-gray-300 rounded-lg p-1.5 text-xs focus:ring-blue-500 focus:border-blue-500"
              >
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
              <button
                @click="startEdit(task)"
                class="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Edit
              </button>
            </div>

            <div v-else class="w-full sm:w-64 space-y-2">
              <input v-model="editForm.title" type="text" placeholder="Title"
                class="block w-full border border-gray-300 rounded-lg p-1.5 text-sm" />
              <textarea v-model="editForm.description" rows="2" placeholder="Description"
                class="block w-full border border-gray-300 rounded-lg p-1.5 text-sm"></textarea>
              <input v-model="editForm.dueDate" type="date"
                class="block w-full border border-gray-300 rounded-lg p-1.5 text-sm" />
              <select v-model="editForm.priority"
                class="block w-full border border-gray-300 rounded-lg p-1.5 text-sm">
                <option value="">No priority</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
              <div class="flex justify-end gap-2">
                <button @click="cancelEdit" class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100">Cancel</button>
                <button @click="saveEdit(task.id)" class="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Save</button>
              </div>
            </div>

            <!-- Teammate 2 will add Delete button here -->
          </div>

        </div>

        <!-- Empty State -->
        <div v-if="tasks.length === 0" class="text-center py-10 bg-white rounded-xl border border-gray-200 border-dashed">
          <p class="text-gray-500">No tasks found. Create one above to get started.</p>
        </div>
      </div>
    </div>
  </div>
</template>