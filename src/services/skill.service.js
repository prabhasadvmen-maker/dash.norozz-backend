import { skillRepository } from '../repositories/skill.repository.js';
import { Category } from '../models/category.model.js';
import { Service } from '../models/service.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class SkillService {
  async createSkill(skillData, user = null) {
    const { name, service, category, description } = skillData;

    let targetCatId = category;
    let targetServiceId = service;

    if (targetServiceId) {
      const srv = await Service.findById(targetServiceId);
      if (!srv) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Target Service record not found');
      }
      targetCatId = srv.category || targetCatId;
    }

    if (targetCatId) {
      const cat = await Category.findById(targetCatId);
      if (!cat) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Target Category not found');
      }
    }

    const cleanName = name.trim();
    const duplicateFilter = {
      name: { $regex: new RegExp(`^${cleanName}$`, 'i') },
      status: { $ne: 'deleted' },
    };

    if (targetServiceId) {
      duplicateFilter.service = targetServiceId;
    } else if (targetCatId) {
      duplicateFilter.category = targetCatId;
    }

    const existing = await skillRepository.model.findOne(duplicateFilter);

    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, `Skill '${cleanName}' already exists for this service`);
    }

    const newSkill = await skillRepository.create({
      name: cleanName,
      service: targetServiceId || null,
      category: targetCatId || null,
      description: description ? description.trim() : '',
      status: 'active',
      createdBy: user?._id || null,
    });

    return await skillRepository.model
      .findById(newSkill._id)
      .populate('service', 'name slug thumbnail')
      .populate('category', 'name slug icon');
  }

  async getAllSkills(queryParams = {}) {
    const { service, services, category, categories, search, status } = queryParams;
    const filter = {};

    if (status) {
      filter.status = status;
    } else {
      filter.status = { $ne: 'deleted' };
    }

    if (service) {
      filter.service = service;
    } else if (services) {
      const srvArray = Array.isArray(services) ? services : services.split(',');
      filter.service = { $in: srvArray };
    }

    if (category) {
      filter.category = category;
    } else if (categories) {
      const catArray = Array.isArray(categories) ? categories : categories.split(',');
      filter.category = { $in: catArray };
    }

    if (search) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    return await skillRepository.model
      .find(filter)
      .populate('service', 'name slug thumbnail')
      .populate('category', 'name slug icon')
      .sort({ name: 1 });
  }

  async getSkillById(id) {
    const skill = await skillRepository.model
      .findById(id)
      .populate('service', 'name slug thumbnail')
      .populate('category', 'name slug icon');
    if (!skill || skill.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Skill not found');
    }
    return skill;
  }

  async updateSkill(id, updateData, user = null) {
    const skill = await skillRepository.findById(id);
    if (!skill || skill.status === 'deleted') {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Skill not found');
    }

    if (updateData.service) {
      const srv = await Service.findById(updateData.service);
      if (!srv) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Target Service record not found');
      }
      skill.service = updateData.service;
      if (srv.category) skill.category = srv.category;
    }

    if (updateData.category) {
      const cat = await Category.findById(updateData.category);
      if (!cat) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Target Category not found');
      }
      skill.category = updateData.category;
    }

    if (updateData.name) {
      skill.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      skill.description = updateData.description.trim();
    }
    if (updateData.status) {
      skill.status = updateData.status;
    }
    if (user?._id) {
      skill.updatedBy = user._id;
    }

    await skill.save();
    return await skillRepository.model
      .findById(skill._id)
      .populate('service', 'name slug thumbnail')
      .populate('category', 'name slug icon');
  }

  async deleteSkill(id) {
    const skill = await skillRepository.findById(id);
    if (!skill) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Skill not found');
    }
    skill.status = 'deleted';
    await skill.save();
    return { message: 'Skill deleted successfully', id };
  }
}

export const skillService = new SkillService();
