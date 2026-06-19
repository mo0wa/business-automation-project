import { useState, useEffect } from 'react';
import { quotesAPI, projectsAPI, statsAPI } from '../services/api';

export function useQuotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const response = await quotesAPI.getAll();
      setQuotes(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const createQuote = async (data) => {
    try {
      await quotesAPI.create(data);
      await fetchQuotes();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateQuote = async (id, data) => {
    try {
      await quotesAPI.update(id, data);
      await fetchQuotes();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteQuote = async (id) => {
    try {
      await quotesAPI.delete(id);
      await fetchQuotes();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return { quotes, loading, error, createQuote, updateQuote, deleteQuote, refetch: fetchQuotes };
}

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await projectsAPI.getAll();
      setProjects(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async (data) => {
    try {
      await projectsAPI.create(data);
      await fetchProjects();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateProject = async (id, data) => {
    try {
      await projectsAPI.update(id, data);
      await fetchProjects();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteProject = async (id) => {
    try {
      await projectsAPI.delete(id);
      await fetchProjects();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return { projects, loading, error, createProject, updateProject, deleteProject, refetch: fetchProjects };
}

export function useStats() {
  const [stats, setStats] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [statsRes, monthlyRes] = await Promise.all([
        statsAPI.getStats(),
        statsAPI.getMonthly()
      ]);
      setStats(statsRes.data);
      setMonthlyData(monthlyRes.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return { stats, monthlyData, loading, error, refetch: fetchStats };
}
